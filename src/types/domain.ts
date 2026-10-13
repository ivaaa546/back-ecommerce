// Enums de dominio — fuente de verdad para toda la aplicación

export enum OrderStatus {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADO = 'CONFIRMADO',
  PREPARANDO = 'PREPARANDO',
  ENVIADO = 'ENVIADO',
  RETORNANDO = 'RETORNANDO',
  ENTREGADO = 'ENTREGADO',
  CANCELADO = 'CANCELADO',
  DEVUELTO = 'DEVUELTO',
}

export enum ShippingType {
  FIXED = 'FIXED',
  FREE = 'FREE',
}

export enum PaymentMethod {
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
}

export enum EntityStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

// Secuencia válida de transición de estados de pedido (RN-006)
export const ORDER_STATUS_SEQUENCE: OrderStatus[] = [
  OrderStatus.PENDIENTE,
  OrderStatus.CONFIRMADO,
  OrderStatus.PREPARANDO,
  OrderStatus.ENVIADO,
  OrderStatus.ENTREGADO,
]

export interface ProductVariantDomain {
  id: string
  productId: string
  name: string
  sku: string
  price: number | string
  stock: number
  images: string[]
  status: EntityStatus
}
