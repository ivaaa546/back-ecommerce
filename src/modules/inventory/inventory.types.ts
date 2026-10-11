export type InventoryFilter = 'all' | 'out_of_stock' | 'low_stock' | 'has_reserved'

export interface InventoryItem {
  id: string
  productId: string
  variantId: string | null
  sku: string
  productName: string
  variantName: string | null
  stock: number
  reservedStock: number
  availableStock: number
  price: number
  status: 'ACTIVE' | 'INACTIVE'
  hasVariants: boolean
}

export type AdjustmentType = 'INCREASE' | 'DECREASE' | 'SET'

export interface AdjustmentPayload {
  type: AdjustmentType
  quantity: number
  reason: string
}

export interface InventoryMovementDTO {
  id: string
  type: string
  productId: string | null
  variantId: string | null
  sku: string
  quantityChange: number
  reservedChange: number
  stockAfter: number
  reservedStockAfter: number
  reason: string | null
  actor: string | null
  orderId: string | null
  createdAt: string
}

export interface InventoryListResponse {
  items: InventoryItem[]
  total: number
  page: number
  limit: number
  totalPages: number
}
