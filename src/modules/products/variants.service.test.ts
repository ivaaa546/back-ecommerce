import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { resetAndSeedIsolatedDb, testPrisma } from '../../../scripts/setup-test-db'
import { AppError } from '../../lib/errors'

let productsService: typeof import('./products.service')
let createOrder: typeof import('../orders/orders.service').createOrder

describe('T-012 y T-013: Variantes, Concurrencia, Stock y Regresión', () => {
  before(async () => {
    await resetAndSeedIsolatedDb()
    productsService = await import('./products.service')
    ;({ createOrder } = await import('../orders/orders.service'))
  })

  it('T-012: Creación y lectura de variantes asociadas a un producto', async () => {
    const prod = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-1' } })

    const createdVar = await productsService.createVariant(prod.id, {
      name: 'Talla M / Blanco',
      sku: 'CAM-M-WHT',
      price: 165.0,
      stock: 8,
      images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
    })

    assert.equal(createdVar.name, 'Talla M / Blanco')
    assert.equal(createdVar.sku, 'CAM-M-WHT')
    assert.equal(Number(createdVar.price), 165.0)
    assert.equal(createdVar.stock, 8)

    // Lectura por slug debe incluir variantes
    const fetched = await productsService.getBySlug(prod.slug)
    const found = fetched.variants.find((v) => v.sku === 'CAM-M-WHT')
    assert.ok(found, 'La variante recién creada debe estar incluida en getBySlug')
    assert.equal(found.name, 'Talla M / Blanco')
  })

  it('T-012: Rechaza SKU duplicado en variantes', async () => {
    await assert.rejects(
      async () => {
        await productsService.createVariant('test-prod-1', {
          name: 'Variante Duplicada',
          sku: 'PLAY-M-BLU', // Ya existe en test-prod-variants
          price: 100,
          stock: 5,
        })
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 409
    )
  })

  it('T-012: Rechaza precio o stock negativo en variantes', async () => {
    await assert.rejects(
      async () => {
        await productsService.createVariant('test-prod-1', {
          name: 'Precio Inválido',
          sku: 'VAR-INV-PRICE',
          price: -10,
          stock: 5,
        })
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )

    await assert.rejects(
      async () => {
        await productsService.createVariant('test-prod-1', {
          name: 'Stock Inválido',
          sku: 'VAR-INV-STOCK',
          price: 100,
          stock: -5,
        })
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
  })

  it('T-012: Rechaza compra sin variante en producto que requiere selección de variante (RN-002)', async () => {
    await assert.rejects(
      async () => {
        await createOrder({
          customer: { fullName: 'Comprador Sin Variante', phone: '12345678' },
          address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 10' },
          paymentMethod: 'CASH_ON_DELIVERY',
          items: [{ productId: 'test-prod-variants', quantity: 1 }],
        })
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
  })

  it('T-012: Rechaza compra cuando la variante no tiene stock suficiente', async () => {
    // test-var-3 tiene stock = 0
    await assert.rejects(
      async () => {
        await createOrder({
          customer: { fullName: 'Comprador Sin Stock', phone: '12345678' },
          address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 10' },
          paymentMethod: 'CASH_ON_DELIVERY',
          items: [{ productId: 'test-prod-variants', variantId: 'test-var-3', quantity: 1 }],
        })
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 409 && err.code === 'STOCK_CONFLICT'
    )
  })

  it('T-012: Compra válida de variante descuenta stock de la variante y toma precio/snapshot vigentes', async () => {
    const var1Before = await testPrisma.productVariant.findUniqueOrThrow({ where: { id: 'test-var-1' } })
    const initialStock = var1Before.stock // 10

    const order = await createOrder({
      customer: { fullName: 'Comprador Variante Exitosa', phone: '77778888' },
      address: { department: 'Guatemala', municipality: 'Mixco', exactAddress: 'Zona 4' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [{ productId: 'test-prod-variants', variantId: 'test-var-1', quantity: 2 }],
    })

    assert.equal(order.items.length, 1)
    assert.equal(order.items[0].variantId, 'test-var-1')
    assert.equal(order.items[0].variantName, 'Talla M / Azul')
    assert.equal(order.items[0].sku, 'PLAY-M-BLU')
    assert.equal(order.items[0].unitPrice, 120.0)
    assert.equal(order.items[0].lineTotal, 240.0)

    const var1After = await testPrisma.productVariant.findUniqueOrThrow({ where: { id: 'test-var-1' } })
    assert.equal(var1After.stock, initialStock - 2)
  })

  it('T-012: Dos compradores concurrentes del último artículo de una variante: solo uno tiene éxito y stock final es 0', async () => {
    // Configurar stock de test-var-2 a exactamente 1 unidad
    await testPrisma.productVariant.update({ where: { id: 'test-var-2' }, data: { stock: 1 } })

    const orderPayload = {
      address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 14' },
      paymentMethod: 'CASH_ON_DELIVERY' as const,
      items: [{ productId: 'test-prod-variants', variantId: 'test-var-2', quantity: 1 }],
    }

    const [res1, res2] = await Promise.allSettled([
      createOrder({ ...orderPayload, customer: { fullName: 'Concurrente Var A', phone: '1111' } }),
      createOrder({ ...orderPayload, customer: { fullName: 'Concurrente Var B', phone: '2222' } }),
    ])

    const successCount = [res1, res2].filter((r) => r.status === 'fulfilled').length
    const rejectedCount = [res1, res2].filter((r) => r.status === 'rejected').length

    assert.equal(successCount, 1, 'Exactamente una compra concurrente de variante debe tener éxito')
    assert.equal(rejectedCount, 1, 'La segunda compra concurrente debe ser rechazada')

    const var2Final = await testPrisma.productVariant.findUniqueOrThrow({ where: { id: 'test-var-2' } })
    assert.equal(var2Final.stock, 0, 'El stock final debe ser exactamente 0, sin sobreventa')
  })

  it('T-013: Regresión de productos simples: comprar producto simple funciona y descuenta de products', async () => {
    // test-prod-2 es producto simple (sin variantes activas)
    const prod2Before = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-2' } })
    const initialStock = prod2Before.stock

    const order = await createOrder({
      customer: { fullName: 'Cliente Producto Simple', phone: '33334444' },
      address: { department: 'Escuintla', municipality: 'Escuintla', exactAddress: 'Km 60' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [{ productId: 'test-prod-2', quantity: 1 }],
    })

    assert.equal(order.items.length, 1)
    assert.equal(order.items[0].variantId, null)
    assert.equal(order.items[0].sku, 'PAN-001')
    assert.equal(order.items[0].unitPrice, 250.5)

    const prod2After = await testPrisma.product.findUniqueOrThrow({ where: { id: 'test-prod-2' } })
    assert.equal(prod2After.stock, initialStock - 1)
  })

  it('Hallazgo 1 y 7: updateVariant y deleteVariant validan productId y tipos estrictos', async () => {
    // Intentar modificar variante con productId incorrecto: debe fallar con 404
    await assert.rejects(
      async () => {
        await productsService.updateVariant('wrong-prod-id', 'test-var-1', { name: 'Hack' })
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 404
    )

    // Intentar eliminar variante con productId incorrecto: debe fallar con 404
    await assert.rejects(
      async () => {
        await productsService.deleteVariant('wrong-prod-id', 'test-var-1')
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 404
    )

    // Intentar actualizar con precio no numérico o negativo
    await assert.rejects(
      async () => {
        await productsService.updateVariant('test-prod-variants', 'test-var-1', { price: -5 })
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
  })

  it('Hallazgo 6: Evita colisión de SKU entre Product simple y ProductVariant', async () => {
    // CAM-001 ya pertenece a test-prod-1 (un producto simple)
    await assert.rejects(
      async () => {
        await productsService.createVariant('test-prod-variants', {
          name: 'Variante con SKU de producto',
          sku: 'CAM-001',
          price: 50,
          stock: 5,
        })
      },
      (err: unknown) => err instanceof AppError && err.statusCode === 409
    )
  })

  it('Hallazgo 8: Desactiva variante si tiene pedidos históricos en vez de hard delete', async () => {
    // test-var-1 tiene pedidos (creados en tests previos)
    const orderItemsCount = await testPrisma.orderItem.count({ where: { variantId: 'test-var-1' } })
    assert.ok(orderItemsCount > 0, 'test-var-1 debe tener al menos un pedido asociado')

    // Eliminar debe resultar en soft-delete (status: INACTIVE)
    const result = await productsService.deleteVariant('test-prod-variants', 'test-var-1')
    assert.equal(result.status, 'INACTIVE')

    const stillExists = await testPrisma.productVariant.findUnique({ where: { id: 'test-var-1' } })
    assert.ok(stillExists, 'La variante debe seguir existiendo en la base de datos')
    assert.equal(stillExists.status, 'INACTIVE')
  })
})
