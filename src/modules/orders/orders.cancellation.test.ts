import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { OrderStatus } from '../../types/domain'
import { resetAndSeedIsolatedDb, testPrisma } from '../../../scripts/setup-test-db'
import { AppError } from '../../lib/errors'

let ordersService: typeof import('./orders.service')

describe('Fase 4: Cancelaciones, Devoluciones y Reposición de Stock', () => {
  before(async () => {
    await resetAndSeedIsolatedDb()
    ordersService = await import('./orders.service')
  })

  it('Cancela pedido de producto simple y restaura stock exactamente una vez', async () => {
    // 1. Obtener stock inicial de prod2
    const prod2Before = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-2' } })
    const initialStock = prod2Before.stock // 5

    // 2. Crear pedido simple de 2 unidades
    const order = await ordersService.createOrder({
      customer: { fullName: 'Cliente Cancelación', phone: '12345678' },
      address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 1' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [{ productId: 'test-prod-2', quantity: 2 }],
    })

    const prod2AfterBuy = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-2' } })
    assert.equal(prod2AfterBuy.stock, initialStock - 2) // 3

    // 3. Cancelar pedido
    const cancelled = await ordersService.cancelOrder(
      order.orderId,
      'Cliente cambió de opinión',
      'ADMIN_ANA'
    )

    assert.equal(cancelled.status, OrderStatus.CANCELADO)
    assert.equal(cancelled.cancellationReason, 'Cliente cambió de opinión')
    assert.equal(cancelled.cancelledBy, 'ADMIN_ANA')
    assert.ok(cancelled.cancelledAt)
    assert.equal(cancelled.stockRestored, true)

    // 4. Verificar stock restaurado en tabla products
    const prod2Final = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-2' } })
    assert.equal(prod2Final.stock, initialStock) // 5 (repuesto)
  })

  it('Cancela pedido de producto con variante y restaura stock en product_variants', async () => {
    // 1. Obtener stock inicial de test-var-1
    const var1Before = await testPrisma.productVariant.findUniqueOrThrow({ where: { id: 'test-var-1' } })
    const initialStock = var1Before.stock // 10

    // 2. Crear pedido con variante de 3 unidades
    const order = await ordersService.createOrder({
      customer: { fullName: 'Cliente Variante Cancel', phone: '55556666' },
      address: { department: 'Guatemala', municipality: 'Mixco', exactAddress: 'Zona 4' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [{ productId: 'test-prod-variants', variantId: 'test-var-1', quantity: 3 }],
    })

    const var1AfterBuy = await testPrisma.productVariant.findUniqueOrThrow({ where: { id: 'test-var-1' } })
    assert.equal(var1AfterBuy.stock, initialStock - 3) // 7

    // 3. Cancelar pedido
    const cancelled = await ordersService.cancelOrder(
      order.orderId,
      'Talla incorrecta seleccionada',
      'ADMIN_CARLOS'
    )

    assert.equal(cancelled.status, OrderStatus.CANCELADO)
    assert.equal(cancelled.cancellationReason, 'Talla incorrecta seleccionada')
    assert.equal(cancelled.cancelledBy, 'ADMIN_CARLOS')
    assert.equal(cancelled.stockRestored, true)

    // 4. Verificar stock restaurado en product_variants
    const var1Final = await testPrisma.productVariant.findUniqueOrThrow({ where: { id: 'test-var-1' } })
    assert.equal(var1Final.stock, initialStock) // 10 (repuesto)

    // Snapshots históricos permanecen intactos
    assert.equal(cancelled.items[0].variantName, 'Talla M / Azul')
    assert.equal(cancelled.items[0].sku, 'PLAY-M-BLU')
  })

  it('Rechaza doble cancelación y no duplica reposición de stock', async () => {
    // 1. Crear pedido
    const order = await ordersService.createOrder({
      customer: { fullName: 'Cliente Doble Cancel', phone: '77778888' },
      address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 10' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [{ productId: 'test-prod-1', quantity: 1 }],
    })

    const prod1BeforeCancel = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })

    // Primera cancelación: éxito
    await ordersService.cancelOrder(order.orderId, 'Motivo 1', 'ADMIN')

    const prod1AfterCancel = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })
    assert.equal(prod1AfterCancel.stock, prod1BeforeCancel.stock + 1)

    // Segunda cancelación: debe fallar con AppError.conflict
    await assert.rejects(
      async () => {
        await ordersService.cancelOrder(order.orderId, 'Motivo 2', 'ADMIN')
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 409
    )

    // Stock no debe incrementarse de nuevo
    const prod1Final = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })
    assert.equal(prod1Final.stock, prod1AfterCancel.stock)
  })

  it('Concurrencia: dos cancelaciones simultáneas del mismo pedido solo ejecutan una reposición', async () => {
    // 1. Crear pedido
    const order = await ordersService.createOrder({
      customer: { fullName: 'Cliente Concurrente', phone: '99990000' },
      address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 15' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [{ productId: 'test-prod-1', quantity: 2 }],
    })

    const prod1BeforeCancel = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })

    // Dos llamadas concurrentes para cancelar el mismo pedido
    const [res1, res2] = await Promise.allSettled([
      ordersService.cancelOrder(order.orderId, 'Cancelación simultánea A', 'ADMIN_1'),
      ordersService.cancelOrder(order.orderId, 'Cancelación simultánea B', 'ADMIN_2'),
    ])

    const successCount = [res1, res2].filter((r) => r.status === 'fulfilled').length
    const rejectedCount = [res1, res2].filter((r) => r.status === 'rejected').length

    assert.equal(successCount, 1, 'Exactamente una cancelación concurrente debe tener éxito')
    assert.equal(rejectedCount, 1, 'La segunda cancelación concurrente debe ser rechazada')

    // El stock debe haberse incrementado exactamente en 2 unidades (una sola vez)
    const prod1Final = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })
    assert.equal(prod1Final.stock, prod1BeforeCancel.stock + 2)
  })

  it('Rechaza cancelación en estados no reversibles (ENVIADO / ENTREGADO)', async () => {
    // Crear y avanzar a ENVIADO
    const order = await ordersService.createOrder({
      customer: { fullName: 'Cliente Enviado', phone: '11223344' },
      address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 9' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [{ productId: 'test-prod-1', quantity: 1 }],
    })

    await ordersService.advanceStatus(order.orderId, OrderStatus.CONFIRMADO)
    await ordersService.advanceStatus(order.orderId, OrderStatus.PREPARANDO)
    await ordersService.advanceStatus(order.orderId, OrderStatus.ENVIADO)

    // Intentar cancelar pedido ENVIADO: debe fallar con 400
    await assert.rejects(
      async () => {
        await ordersService.cancelOrder(order.orderId, 'Cancelar en tránsito', 'ADMIN')
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
  })

  it('Procesa devolución desde pedido ENTREGADO y repone stock de producto y variante', async () => {
    // 1. Crear pedido mixto (producto simple + producto con variante)
    const order = await ordersService.createOrder({
      customer: { fullName: 'Cliente Devolución', phone: '44556677' },
      address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 11' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [
        { productId: 'test-prod-1', quantity: 1 },
        { productId: 'test-prod-variants', variantId: 'test-var-1', quantity: 1 },
      ],
    })

    // Avanzar paso a paso hasta ENTREGADO
    await ordersService.advanceStatus(order.orderId, OrderStatus.CONFIRMADO)
    await ordersService.advanceStatus(order.orderId, OrderStatus.PREPARANDO)
    await ordersService.advanceStatus(order.orderId, OrderStatus.ENVIADO)
    await ordersService.advanceStatus(order.orderId, OrderStatus.ENTREGADO)

    const prod1BeforeReturn = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })
    const var1BeforeReturn = await testPrisma.productVariant.findUniqueOrThrow({ where: { id: 'test-var-1' } })

    // 2. Procesar devolución
    const returned = await ordersService.returnOrder(
      order.orderId,
      'Producto defectuoso devuelto en garantía',
      'ADMIN_SOPORTE'
    )

    assert.equal(returned.status, OrderStatus.DEVUELTO)
    assert.equal(returned.returnReason, 'Producto defectuoso devuelto en garantía')
    assert.equal(returned.returnedBy, 'ADMIN_SOPORTE')
    assert.ok(returned.returnedAt)
    assert.equal(returned.stockRestored, true)

    // 3. Verificar que se repuso stock de ambos ítems (simple y variante)
    const prod1AfterReturn = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })
    const var1AfterReturn = await testPrisma.productVariant.findUniqueOrThrow({ where: { id: 'test-var-1' } })

    assert.equal(prod1AfterReturn.stock, prod1BeforeReturn.stock + 1)
    assert.equal(var1AfterReturn.stock, var1BeforeReturn.stock + 1)
  })

  it('Rechaza devolución si el pedido NO está en estado ENTREGADO', async () => {
    // Pedido en estado PENDIENTE
    const order = await ordersService.createOrder({
      customer: { fullName: 'Cliente No Entregado', phone: '99887766' },
      address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 12' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [{ productId: 'test-prod-1', quantity: 1 }],
    })

    await assert.rejects(
      async () => {
        await ordersService.returnOrder(order.orderId, 'Devolución prematura', 'ADMIN')
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
  })

  it('Rechaza doble devolución en pedido ya devuelto', async () => {
    // Crear y llevar a ENTREGADO
    const order = await ordersService.createOrder({
      customer: { fullName: 'Cliente Doble Dev', phone: '33221100' },
      address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 13' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [{ productId: 'test-prod-1', quantity: 1 }],
    })

    await ordersService.advanceStatus(order.orderId, OrderStatus.CONFIRMADO)
    await ordersService.advanceStatus(order.orderId, OrderStatus.PREPARANDO)
    await ordersService.advanceStatus(order.orderId, OrderStatus.ENVIADO)
    await ordersService.advanceStatus(order.orderId, OrderStatus.ENTREGADO)

    // Primera devolución: éxito
    await ordersService.returnOrder(order.orderId, 'Primera devolución', 'ADMIN')

    // Segunda devolución: debe fallar con 409
    await assert.rejects(
      async () => {
        await ordersService.returnOrder(order.orderId, 'Segunda devolución duplicada', 'ADMIN')
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 409
    )
  })
})
