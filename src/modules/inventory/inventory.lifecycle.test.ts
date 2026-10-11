import test from 'node:test'
import assert from 'node:assert/strict'
import { resetAndSeedIsolatedDb, testPrisma } from '../../../scripts/setup-test-db'
import * as inventoryService from './inventory.service'
import { createOrder, advanceStatus, cancelOrder, returnOrder } from '../orders/orders.service'
import { OrderStatus } from '../../types/domain'

test('T-006: Ciclo completo de Inventario, Reservas, Despacho, Cancelación y Pedidos Históricos', async (t) => {
  await resetAndSeedIsolatedDb(true)

  await t.test('Ciclo completo: Crear (Reserva) -> Despachar (Salida) -> Doble Despacho (Idempotente) -> Devolver (Reposición)', async () => {
    // 1. Estado inicial
    const initialItem = await inventoryService.getInventoryItemById('CAM-001')
    assert.equal(initialItem.stock, 10)
    assert.equal(initialItem.reservedStock, 0)
    assert.equal(initialItem.availableStock, 10)

    // 2. Crear pedido de 3 unidades -> debe reservar
    const order = await createOrder({
      customer: { fullName: 'Comprador Ciclo', phone: '55551111' },
      address: { department: 'Guatemala', municipality: 'Guatemala', exactAddress: 'Zona 14' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [{ productId: 'test-prod-1', quantity: 3 }],
    })

    const afterReserve = await inventoryService.getInventoryItemById('CAM-001')
    assert.equal(afterReserve.stock, 10, 'Físico no cambia al reservar')
    assert.equal(afterReserve.reservedStock, 3, 'Reserva 3 unidades')
    assert.equal(afterReserve.availableStock, 7, 'Disponible baja a 7')

    const reserveMovements = await inventoryService.getInventoryMovements('CAM-001')
    assert.ok(reserveMovements.movements.some((m) => m.type === 'RESERVA_PEDIDO' && m.reservedChange === 3))

    // 3. Avanzar a CONFIRMADO -> PREPARANDO -> ENVIADO (Despacho físico)
    await advanceStatus(order.orderId, OrderStatus.CONFIRMADO)
    await advanceStatus(order.orderId, OrderStatus.PREPARANDO)
    await advanceStatus(order.orderId, OrderStatus.ENVIADO)

    const afterShip = await inventoryService.getInventoryItemById('CAM-001')
    assert.equal(afterShip.stock, 7, 'Físico descuenta 3 unidades al despachar')
    assert.equal(afterShip.reservedStock, 0, 'Reserva convertida a 0')
    assert.equal(afterShip.availableStock, 7, 'Disponible sigue en 7')

    const shipMovements = await inventoryService.getInventoryMovements('CAM-001')
    assert.ok(shipMovements.movements.some((m) => m.type === 'SALIDA_PEDIDO' && m.quantityChange === -3))

    // 4. CL-008: Transición idempotente no duplica salida física
    // Llamar directamente a shipOrderInventory en el mismo pedido no produce cambios
    await testPrisma.$transaction(async (tx) => {
      await inventoryService.shipOrderInventory(tx, order.orderId)
    })

    const afterDoubleShip = await inventoryService.getInventoryItemById('CAM-001')
    assert.equal(afterDoubleShip.stock, 7, 'No hay doble deducción')

    // 5. Avanzar a ENTREGADO y Devolver -> Repone stock físico
    await advanceStatus(order.orderId, OrderStatus.ENTREGADO)
    await returnOrder(order.orderId, 'Garantía por defecto', 'ADMIN_RETURNS')

    const afterReturn = await inventoryService.getInventoryItemById('CAM-001')
    assert.equal(afterReturn.stock, 10, 'Stock físico repuesto a 10')
    assert.equal(afterReturn.reservedStock, 0)
    assert.equal(afterReturn.availableStock, 10)

    const returnMovements = await inventoryService.getInventoryMovements('CAM-001')
    assert.ok(returnMovements.movements.some((m) => m.type === 'REPOSICION_PEDIDO' && m.quantityChange === 3))
  })

  await t.test('Cancelación previa a despacho libera reserva sin reposición física ficticia (RF-009)', async () => {
    // 1. Crear pedido de variante
    const order = await createOrder({
      customer: { fullName: 'Comprador Cancel Previo', phone: '44442222' },
      address: { department: 'Guatemala', municipality: 'Mixco', exactAddress: 'Zona 1' },
      paymentMethod: 'CASH_ON_DELIVERY',
      items: [{ productId: 'test-prod-variants', variantId: 'test-var-1', quantity: 2 }],
    })

    const afterReserve = await inventoryService.getInventoryItemById('PLAY-M-BLU')
    assert.equal(afterReserve.stock, 10)
    assert.equal(afterReserve.reservedStock, 2)
    assert.equal(afterReserve.availableStock, 8)

    // 2. Cancelar antes de despacho
    await cancelOrder(order.orderId, 'Error en selección de talla', 'ADMIN_ANA')

    const afterCancel = await inventoryService.getInventoryItemById('PLAY-M-BLU')
    assert.equal(afterCancel.stock, 10, 'Físico intacto')
    assert.equal(afterCancel.reservedStock, 0, 'Reserva liberada a 0')
    assert.equal(afterCancel.availableStock, 10, 'Disponible vuelve a 10')

    const cancelMovements = await inventoryService.getInventoryMovements('PLAY-M-BLU')
    assert.ok(cancelMovements.movements.some((m) => m.type === 'LIBERACION_PEDIDO' && m.reservedChange === -2))
  })

  await t.test('CL-010: Consultar historial de SKU sin movimientos previos retorna array vacío', async () => {
    // Pantalón Denim (PAN-001) aún no tiene movimientos
    const history = await inventoryService.getInventoryMovements('PAN-001')
    assert.equal(history.total, 0)
    assert.deepEqual(history.movements, [])
  })

  await t.test('DT-006: Pedidos históricos (creados antes de la migración) no generan salida duplicada', async () => {
    // Crear un pedido simulando fecha histórica y inventoryShipped = true
    const historicOrder = await testPrisma.order.create({
      data: {
        orderNumber: '#9999',
        status: OrderStatus.PREPARANDO,
        subtotal: 150,
        shippingCost: 30,
        total: 180,
        customerName: 'Cliente Histórico',
        customerPhone: '55556666',
        department: 'Guatemala',
        municipality: 'Guatemala',
        exactAddress: 'Histórica 1-00',
        inventoryReserved: false,
        inventoryShipped: true, // Ya descontado en el pasado
        items: {
          create: [{
            productId: 'test-prod-2',
            productName: 'Pantalón Denim',
            sku: 'PAN-001',
            unitPrice: 250.5,
            quantity: 1,
          }],
        },
      },
    })

    const prodBefore = await inventoryService.getInventoryItemById('PAN-001')
    const stockBefore = prodBefore.stock

    // Avanzar a ENVIADO: no debe descontar nuevamente
    await advanceStatus(historicOrder.id, OrderStatus.ENVIADO)

    const prodAfter = await inventoryService.getInventoryItemById('PAN-001')
    assert.equal(prodAfter.stock, stockBefore, 'Pedidos históricos no sufren doble salida al cambiar a ENVIADO')
  })
})
