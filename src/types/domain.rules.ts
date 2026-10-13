import { OrderStatus, ORDER_STATUS_SEQUENCE } from '../types/domain'

/**
 * Redondea un importe a 2 decimales con precisión monetaria (RNF-010).
 * Evita errores de representación binaria de punto flotante en JavaScript.
 */
export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100
}

/**
 * Normaliza y consolida líneas de pedido repetidas por tupla (productId, variantId) (DT-001, DT-002, RF-007, RF-032, RN-012).
 * Dos o más líneas con el mismo productId y la misma variante se unen sumando sus cantidades.
 * Dos líneas con el mismo productId pero distinta variante permanecen separadas.
 */
export function consolidateOrderItems<T extends { productId: string; variantId?: string | null; quantity: number }>(
  items: T[]
): Array<{ productId: string; variantId?: string | null; quantity: number }> {
  const map = new Map<string, { productId: string; variantId?: string | null; quantity: number }>()

  for (const item of items) {
    const vId = item.variantId ? item.variantId.trim() : (item.variantId === null ? null : undefined)
    const key = `${item.productId}::${vId ?? ''}`
    const existing = map.get(key)
    if (existing) {
      existing.quantity += item.quantity
    } else {
      map.set(key, {
        productId: item.productId,
        ...(vId !== undefined ? { variantId: vId } : {}),
        quantity: item.quantity,
      })
    }
  }

  return Array.from(map.values())
}

/**
 * Estados desde los cuales se puede cancelar un pedido con reposición de inventario.
 */
export const CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDIENTE,
  OrderStatus.CONFIRMADO,
  OrderStatus.PREPARANDO,
]

export function canCancelOrder(status: OrderStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status)
}

export function canReturnOrder(status: OrderStatus): boolean {
  return status === OrderStatus.ENTREGADO || status === OrderStatus.RETORNANDO
}

/**
 * Verifica si la transición de estado de un pedido es válida (RN-006).
 * Admite el avance secuencial normal, cancelaciones antes de envío y devoluciones desde entregado.
 */
export function canTransitionTo(current: OrderStatus, next: OrderStatus): boolean {
  if (current === OrderStatus.CANCELADO || current === OrderStatus.DEVUELTO) {
    return false
  }

  if (next === OrderStatus.CANCELADO) {
    return canCancelOrder(current)
  }

  if (next === OrderStatus.DEVUELTO) {
    return canReturnOrder(current)
  }

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
