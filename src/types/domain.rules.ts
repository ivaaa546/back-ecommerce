import { OrderStatus, ORDER_STATUS_SEQUENCE } from '../types/domain'

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
 * Calcula subtotal, costo de envío y total de un pedido (RN-003, RN-010).
 */
export function calculateOrderTotals(
  items: Array<{ unitPrice: number; quantity: number }>,
  shippingCost: number
): { subtotal: number; shippingCost: number; total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  return {
    subtotal,
    shippingCost,
    total: subtotal + shippingCost,
  }
}
