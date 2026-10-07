import { OrderStatus, ORDER_STATUS_SEQUENCE } from '../types/domain'

/**
 * Redondea un importe a 2 decimales con precisión monetaria (RNF-010).
 * Evita errores de representación binaria de punto flotante en JavaScript.
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

/**
 * Normaliza y consolida líneas de pedido repetidas por productId (DT-001, RF-032, RN-012).
 * Dos o más líneas con el mismo productId se unen sumando sus cantidades.
 */
export function consolidateOrderItems<T extends { productId: string; quantity: number }>(
  items: T[]
): Array<{ productId: string; quantity: number }> {
  const map = new Map<string, number>()

  for (const item of items) {
    const existing = map.get(item.productId) ?? 0
    map.set(item.productId, existing + item.quantity)
  }

  const result: Array<{ productId: string; quantity: number }> = []
  for (const [productId, quantity] of map.entries()) {
    result.push({ productId, quantity })
  }

  return result
}

/**
 * Verifica si la transición de estado de un pedido es válida (RN-006).
 * El estado solo puede avanzar en secuencia, nunca retroceder ni saltar pasos.
 */
export function canTransitionTo(current: OrderStatus, next: OrderStatus): boolean {
  const currentIndex = ORDER_STATUS_SEQUENCE.indexOf(current)
  const nextIndex = ORDER_STATUS_SEQUENCE.indexOf(next)
  return nextIndex === currentIndex + 1
}

/**
 * Calcula subtotal, costo de envío y total de un pedido con precisión de dos decimales (RN-003, RN-010, RNF-010).
 */
export function calculateOrderTotals(
  items: Array<{ unitPrice: number; quantity: number }>,
  shippingCost: number
): { subtotal: number; shippingCost: number; total: number } {
  let subtotalCents = 0

  for (const item of items) {
    // Redondear a centavos cada línea
    const lineTotal = roundMoney(item.unitPrice * item.quantity)
    subtotalCents += Math.round(lineTotal * 100)
  }

  const roundedSubtotal = subtotalCents / 100
  const roundedShipping = roundMoney(shippingCost)
  const total = roundMoney(roundedSubtotal + roundedShipping)

  return {
    subtotal: roundedSubtotal,
    shippingCost: roundedShipping,
    total,
  }
}
