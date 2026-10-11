import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { EntityStatus } from '@prisma/client'
import { resetAndSeedIsolatedDb, testPrisma } from '../../../scripts/setup-test-db'
import { AppError } from '../../lib/errors'
import type { createOrder as createOrderType, advanceStatus as advanceStatusType } from './orders.service'
import { OrderStatus } from '../../types/domain'

let createOrder: typeof createOrderType
let advanceStatus: typeof advanceStatusType

describe('T-014, T-015, T-016: Servicio de Pedidos con Aislamiento y Concurrencia', () => {
  before(async () => {
    // Configura y siembra el esquema test_isolated antes de cargar servicios con Prisma singleton.
    await resetAndSeedIsolatedDb()
    ;({ createOrder, advanceStatus } = await import('./orders.service'))
  })

  it('T-014: Rechaza compra si un producto no existe y no modifica inventario', async () => {
    const initialProduct = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })

    await assert.rejects(
      async () => {
        await createOrder({
          customer: { fullName: 'Ana', phone: '123' },
          address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 1' },
          paymentMethod: 'CASH_ON_DELIVERY',
          items: [
            { productId: 'test-prod-1', quantity: 1 },
            { productId: 'non-existent-id', quantity: 1 },
          ],
        })
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 404
    )

    const productAfter = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })
    assert.equal(productAfter.stock, initialProduct.stock) // Stock intacto
  })

  it('T-014: Rechaza compra si un producto está INACTIVO y no modifica inventario', async () => {
    // Desactivar temporalmente producto 2
    await testPrisma.product.update({ where: { id: 'test-prod-2' }, data: { status: EntityStatus.INACTIVE } })
    const initialProduct = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })

    await assert.rejects(
      async () => {
        await createOrder({
          customer: { fullName: 'Carlos', phone: '123' },
          address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 1' },
          paymentMethod: 'CASH_ON_DELIVERY',
          items: [{ productId: 'test-prod-2', quantity: 1 }],
        })
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )

    // Reactivar para siguientes pruebas
    await testPrisma.product.update({ where: { id: 'test-prod-2' }, data: { status: EntityStatus.ACTIVE } })
    const productAfter = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })
    assert.equal(productAfter.stock, initialProduct.stock)
  })

  it('T-015: Con stock 5 y demanda 8, falla por stock insuficiente y revierte cambios', async () => {
    const prod2Before = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-2' } })
    assert.equal(prod2Before.stock, 5)

    await assert.rejects(
      async () => {
        await createOrder({
          customer: { fullName: 'Mario', phone: '123' },
          address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 1' },
          paymentMethod: 'CASH_ON_DELIVERY',
          items: [{ productId: 'test-prod-2', quantity: 8 }],
        })
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 409 && err.code === 'STOCK_CONFLICT'
    )

    const prod2After = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-2' } })
    assert.equal(prod2After.stock, 5) // No se descontó nada
  })

  it('T-014 y T-016: Pedido válido consolida líneas repetidas, calcula totales de servidor y asigna número único', async () => {
    const prod1Before = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })
    const initialStock = prod1Before.stock // 10

    // Enviar dos líneas del mismo producto: 2 + 1 = 3 unidades
    const response = await createOrder({
      customer: { fullName: 'Comprador Consolidado', phone: '99998888', email: 'comp@test.com' },
      address: { department: 'Guatemala', municipality: 'Mixco', exactAddress: 'Km 15 Calzada Roosevelt' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [
        { productId: 'test-prod-1', quantity: 2 },
        { productId: 'test-prod-1', quantity: 1 },
      ],
    })

    // Debe retornar 1 sola línea consolidada
    assert.equal(response.items.length, 1)
    assert.equal(response.items[0].quantity, 3)
    assert.equal(response.items[0].unitPrice, 150)
    assert.equal(response.items[0].lineTotal, 450)
    assert.equal(response.subtotal, 450)
    assert.equal(response.shippingCost, 30)
    assert.equal(response.total, 480)
    assert.match(response.orderNumber, /^#\d{4,}$/)

    // Comprobar persistencia en base de datos con reserva (Feature 005)
    const prod1After = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })
    assert.equal(prod1After.stock, initialStock) // Stock físico conservado antes de despacho
    assert.equal(prod1After.reservedStock, 3) // Reservadas exactamente 3 unidades
    assert.equal(prod1After.stock - prod1After.reservedStock, initialStock - 3) // Disponible = 7

    // Al avanzar a ENVIADO, se ejecuta la salida física definitiva (DT-004)
    await advanceStatus(response.orderId, OrderStatus.CONFIRMADO)
    await advanceStatus(response.orderId, OrderStatus.PREPARANDO)
    await advanceStatus(response.orderId, OrderStatus.ENVIADO)

    const prod1Dispatched = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })
    assert.equal(prod1Dispatched.stock, initialStock - 3) // Descontadas físicamente 3 unidades
    assert.equal(prod1Dispatched.reservedStock, 0) // Reserva convertida en salida

    const savedOrder = await testPrisma.order.findUniqueOrThrow({
      where: { id: response.orderId },
      include: { items: true },
    })
    assert.equal(savedOrder.items.length, 1)
    assert.equal(savedOrder.items[0].quantity, 3)
    assert.equal(savedOrder.inventoryShipped, true)
  })

  it('T-015: Dos compradores concurrentes del último artículo: solo uno tiene éxito', async () => {
    // Configurar stock del producto 2 a exactamente 1 unidad y 0 reservas
    await testPrisma.product.update({ where: { id: 'test-prod-2' }, data: { stock: 1, reservedStock: 0 } })

    const orderPayload = {
      address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 10' },
      paymentMethod: 'CASH_ON_DELIVERY' as const,
      items: [{ productId: 'test-prod-2', quantity: 1 }],
    }

    const [res1, res2] = await Promise.allSettled([
      createOrder({ ...orderPayload, customer: { fullName: 'Comprador A', phone: '1111' } }),
      createOrder({ ...orderPayload, customer: { fullName: 'Comprador B', phone: '2222' } }),
    ])

    const successCount = [res1, res2].filter((r) => r.status === 'fulfilled').length
    const rejectedCount = [res1, res2].filter((r) => r.status === 'rejected').length

    assert.equal(successCount, 1, 'Exactamente una solicitud concurrente debe completarse')
    assert.equal(rejectedCount, 1, 'Exactamente una solicitud concurrente debe ser rechazada')

    // El disponible final debe ser exactamente 0 (stock 1 - reservado 1 = 0), sin sobreventa
    const prod2Final = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-2' } })
    assert.equal(prod2Final.reservedStock, 1)
    assert.equal(prod2Final.stock - prod2Final.reservedStock, 0)
  })
})
