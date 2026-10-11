import test from 'node:test'
import assert from 'node:assert/strict'
import { resetAndSeedIsolatedDb, testPrisma } from '../../../scripts/setup-test-db'
import * as inventoryService from './inventory.service'
import { AppError } from '../../lib/errors'

test('T-002: Módulo de Inventario por SKU, consultas, ajustes y movimientos', async (t) => {
  await resetAndSeedIsolatedDb(true)

  await t.test('listInventoryItems lista productos simples y variantes como SKU independientes con stock, reservado y disponible', async () => {
    const res = await inventoryService.listInventoryItems({ page: 1, limit: 50 })
    assert.ok(res.items.length >= 4, 'Debe haber al menos 2 simples y 3 variantes sembradas')

    // Verificar producto simple
    const simple = res.items.find((i) => i.sku === 'CAM-001')
    assert.ok(simple, 'Camisa Casual debe figurar como SKU')
    assert.equal(simple.variantId, null)
    assert.equal(simple.stock, 10)
    assert.equal(simple.reservedStock, 0)
    assert.equal(simple.availableStock, 10)

    // Verificar variante
    const variant = res.items.find((i) => i.sku === 'PLAY-M-BLU')
    assert.ok(variant, 'Playera Deportiva Talla M debe figurar como SKU')
    assert.ok(variant.variantId !== null)
    assert.equal(variant.variantName, 'Talla M / Azul')
    assert.equal(variant.stock, 10)
    assert.equal(variant.reservedStock, 0)
    assert.equal(variant.availableStock, 10)
  })

  await t.test('Filtros de búsqueda y disponibilidad funcionan correctamente (CU-006, RF-003, DT-007)', async () => {
    // Búsqueda por SKU
    const searchSku = await inventoryService.listInventoryItems({ search: 'CAM-001' })
    assert.equal(searchSku.items.length, 1)
    assert.equal(searchSku.items[0].sku, 'CAM-001')

    // Búsqueda por nombre de variante
    const searchVar = await inventoryService.listInventoryItems({ search: 'Talla L' })
    assert.equal(searchVar.items.length, 1)
    assert.equal(searchVar.items[0].sku, 'PLAY-L-RED')

    // Filtro out_of_stock
    const outOfStock = await inventoryService.listInventoryItems({ filter: 'out_of_stock' })
    const outItem = outOfStock.items.find((i) => i.sku === 'PLAY-XL-BLK')
    assert.ok(outItem, 'PLAY-XL-BLK tiene stock 0 y debe figurar en out_of_stock')

    // Filtro low_stock (<= 5 y > 0)
    const lowStock = await inventoryService.listInventoryItems({ filter: 'low_stock' })
    const lowItem = lowStock.items.find((i) => i.sku === 'PLAY-L-RED')
    assert.ok(lowItem, 'PLAY-L-RED tiene stock 2 y debe figurar en low_stock')
  })

  await t.test('adjustInventoryItem aplica aumento de stock y genera movimiento trazable (RF-006, RF-005)', async () => {
    const res = await inventoryService.adjustInventoryItem(
      'CAM-001',
      {
        type: 'INCREASE',
        quantity: 5,
        reason: 'Recepción de lote de proveedor',
      },
      'admin@test.com'
    )

    assert.equal(res.item.stock, 15)
    assert.equal(res.item.availableStock, 15)
    assert.equal(res.movement.type, 'AJUSTE_MANUAL')
    assert.equal(res.movement.quantityChange, 5)
    assert.equal(res.movement.reservedChange, 0)
    assert.equal(res.movement.stockAfter, 15)
    assert.equal(res.movement.reason, 'Recepción de lote de proveedor')
    assert.equal(res.movement.actor, 'admin@test.com')

    // Historial
    const history = await inventoryService.getInventoryMovements('CAM-001')
    assert.ok(history.movements.length >= 1)
    assert.equal(history.movements[0].id, res.movement.id)
  })

  await t.test('adjustInventoryItem rechaza ajuste sin motivo obligatorio (RN-006, CL-004)', async () => {
    await assert.rejects(
      async () => {
        await inventoryService.adjustInventoryItem(
          'CAM-001',
          {
            type: 'INCREASE',
            quantity: 2,
            reason: '   ',
          },
          'admin@test.com'
        )
      },
      (err: any) => err instanceof AppError && err.statusCode === 400
    )
  })

  await t.test('adjustInventoryItem no permite reducir existencias por debajo de reservas (RN-007, CL-003)', async () => {
    // Forzar una reserva en el producto
    await testPrisma.product.update({
      where: { sku: 'PAN-001' },
      data: { stock: 5, reservedStock: 3 },
    })

    // Intentar reducir a stock 2 (menor que reserva 3)
    await assert.rejects(
      async () => {
        await inventoryService.adjustInventoryItem(
          'PAN-001',
          {
            type: 'DECREASE',
            quantity: 3, // dejaría stock en 2, pero reserva es 3
            reason: 'Ajuste de merma',
          },
          'admin@test.com'
        )
      },
      (err: any) => {
        assert.ok(err instanceof AppError)
        assert.equal(err.statusCode, 400)
        assert.match(err.message, /por debajo de las unidades reservadas/)
        return true
      }
    )

    // Intentar SET a 2 (menor que reserva 3)
    await assert.rejects(
      async () => {
        await inventoryService.adjustInventoryItem(
          'PAN-001',
          {
            type: 'SET',
            quantity: 2,
            reason: 'Conteo físico',
          },
          'admin@test.com'
        )
      },
      (err: any) => {
        assert.ok(err instanceof AppError)
        assert.equal(err.statusCode, 400)
        return true
      }
    )
  })

  await t.test('adjustInventoryItem no permite saldo negativo (CL-002)', async () => {
    await assert.rejects(
      async () => {
        await inventoryService.adjustInventoryItem(
          'PAN-001',
          {
            type: 'SET',
            quantity: -5,
            reason: 'Conteo inválido',
          },
          'admin@test.com'
        )
      },
      (err: any) => err instanceof AppError && err.statusCode === 400
    )
  })
})
