// Enums de dominio — fuente de verdad para toda la aplicación

export enum OrderStatus {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADO = 'CONFIRMADO',
  PREPARANDO = 'PREPARANDO',
  ENVIADO = 'ENVIADO',
  ENTREGADO = 'ENTREGADO',
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
