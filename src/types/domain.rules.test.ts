import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  consolidateOrderItems,
  calculateOrderTotals,
  roundMoney,
  canTransitionTo,
} from './domain.rules'
import { OrderStatus } from './domain'

describe('T-006: Consolidación de líneas y cálculo monetario', () => {
  it('consolida dos o más líneas del mismo producto sumando sus cantidades', () => {
    const rawItems = [
      { productId: 'prod-A', quantity: 2 },
      { productId: 'prod-B', quantity: 1 },
      { productId: 'prod-A', quantity: 3 },
      { productId: 'prod-C', quantity: 5 },
      { productId: 'prod-B', quantity: 4 },
    ]

    const consolidated = consolidateOrderItems(rawItems)
    assert.equal(consolidated.length, 3)

    const itemA = consolidated.find((i) => i.productId === 'prod-A')
    const itemB = consolidated.find((i) => i.productId === 'prod-B')
    const itemC = consolidated.find((i) => i.productId === 'prod-C')

    assert.equal(itemA?.quantity, 5) // 2 + 3
    assert.equal(itemB?.quantity, 5) // 1 + 4
    assert.equal(itemC?.quantity, 5)
  })

  it('T-004: consolida líneas con misma variante y separa líneas con distinta variante del mismo producto', () => {
    const rawItems = [
      { productId: 'prod-A', variantId: 'var-1', quantity: 2 },
      { productId: 'prod-A', variantId: 'var-2', quantity: 1 },
      { productId: 'prod-A', variantId: 'var-1', quantity: 3 },
      { productId: 'prod-B', quantity: 4 },
      { productId: 'prod-B', quantity: 2 },
    ]

    const consolidated = consolidateOrderItems(rawItems)
    assert.equal(consolidated.length, 3)

    const var1 = consolidated.find((i) => i.productId === 'prod-A' && i.variantId === 'var-1')
    const var2 = consolidated.find((i) => i.productId === 'prod-A' && i.variantId === 'var-2')
    const prodB = consolidated.find((i) => i.productId === 'prod-B')

    assert.equal(var1?.quantity, 5) // 2 + 3
    assert.equal(var2?.quantity, 1)
    assert.equal(prodB?.quantity, 6) // 4 + 2
  })

  it('no altera una lista de líneas únicas', () => {
    const rawItems = [
      { productId: 'prod-1', quantity: 1 },
      { productId: 'prod-2', quantity: 3 },
    ]
    const consolidated = consolidateOrderItems(rawItems)
    assert.equal(consolidated.length, 2)
    assert.deepEqual(consolidated, rawItems)
  })

  it('roundMoney redondea correctamente a dos decimales y evita desbordes de coma flotante', () => {
    assert.equal(roundMoney(0.1 + 0.2), 0.3)
    assert.equal(roundMoney(19.999), 20)
    assert.equal(roundMoney(19.994), 19.99)
    assert.equal(roundMoney(10.5), 10.5)
    assert.equal(roundMoney(0), 0)
  })

  it('calculateOrderTotals calcula subtotal, envío y total exactos para precios con centavos', () => {
    const items = [
      { unitPrice: 19.99, quantity: 3 }, // 59.97
      { unitPrice: 4.55, quantity: 2 },  // 9.10
      { unitPrice: 0.99, quantity: 1 },  // 0.99
    ]
    // Subtotal esperado: 59.97 + 9.10 + 0.99 = 70.06
    const shippingCost = 30.00
    // Total esperado: 70.06 + 30.00 = 100.06

    const totals = calculateOrderTotals(items, shippingCost)
    assert.equal(totals.subtotal, 70.06)
    assert.equal(totals.shippingCost, 30.00)
    assert.equal(totals.total, 100.06)
  })

  it('calculateOrderTotals maneja envío gratuito (Q0.00)', () => {
    const items = [{ unitPrice: 49.99, quantity: 2 }] // 99.98
    const totals = calculateOrderTotals(items, 0)
    assert.equal(totals.subtotal, 99.98)
    assert.equal(totals.shippingCost, 0)
    assert.equal(totals.total, 99.98)
  })

  it('canTransitionTo valida la secuencia estricta de estados de pedido', () => {
    assert.equal(canTransitionTo(OrderStatus.PENDIENTE, OrderStatus.CONFIRMADO), true)
    assert.equal(canTransitionTo(OrderStatus.CONFIRMADO, OrderStatus.PREPARANDO), true)
    assert.equal(canTransitionTo(OrderStatus.PREPARANDO, OrderStatus.ENVIADO), true)
    assert.equal(canTransitionTo(OrderStatus.ENVIADO, OrderStatus.ENTREGADO), true)

    // Saltos o retrocesos inválidos
    assert.equal(canTransitionTo(OrderStatus.PENDIENTE, OrderStatus.ENVIADO), false)
    assert.equal(canTransitionTo(OrderStatus.ENTREGADO, OrderStatus.PENDIENTE), false)
    assert.equal(canTransitionTo(OrderStatus.CONFIRMADO, OrderStatus.CONFIRMADO), false)

    // Cancelaciones válidas (antes de envío) e inválidas
    assert.equal(canTransitionTo(OrderStatus.PENDIENTE, OrderStatus.CANCELADO), true)
    assert.equal(canTransitionTo(OrderStatus.CONFIRMADO, OrderStatus.CANCELADO), true)
    assert.equal(canTransitionTo(OrderStatus.PREPARANDO, OrderStatus.CANCELADO), true)
    assert.equal(canTransitionTo(OrderStatus.ENVIADO, OrderStatus.CANCELADO), false)
    assert.equal(canTransitionTo(OrderStatus.ENTREGADO, OrderStatus.CANCELADO), false)
    assert.equal(canTransitionTo(OrderStatus.CANCELADO, OrderStatus.CANCELADO), false)

    // Devoluciones válidas (solo desde entregado) e inválidas
    assert.equal(canTransitionTo(OrderStatus.ENTREGADO, OrderStatus.DEVUELTO), true)
    assert.equal(canTransitionTo(OrderStatus.ENVIADO, OrderStatus.DEVUELTO), false)
    assert.equal(canTransitionTo(OrderStatus.PREPARANDO, OrderStatus.DEVUELTO), false)
    assert.equal(canTransitionTo(OrderStatus.DEVUELTO, OrderStatus.ENTREGADO), false)
  })
})
