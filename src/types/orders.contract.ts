import { OrderStatus } from './domain'

export interface AuthoritativeOrderItem {
  productId: string
  variantId?: string | null
  productName: string
  variantName?: string | null
  sku?: string | null
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface AuthoritativeOrderResponse {
  orderId: string
  orderNumber: string
  status: OrderStatus
  items: AuthoritativeOrderItem[]
  subtotal: number
  shippingCost: number
  total: number
  currency: 'GTQ'
  customer: {
    fullName: string
    phone: string
    email?: string
  }
  createdAt: string
}

export interface PriceConflictDetails {
  previousSubtotal?: number
  currentSubtotal: number
  previousShipping?: number
  currentShipping: number
  previousTotal?: number
  currentTotal: number
  changedItems: Array<{
    productId: string
    productName: string
    previousPrice?: number
    currentPrice: number
  }>
}

export interface StockConflictDetails {
  unavailableItems: Array<{
    productId: string
    productName?: string
    requestedQuantity: number
    availableStock: number
  }>
}
