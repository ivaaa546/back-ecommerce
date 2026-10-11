import { AppError } from '../../lib/errors'

export interface ValidatedOrderItem {
  productId: string
  variantId?: string | null
  quantity: number
}

export interface ValidatedOrderData {
  customer: {
    fullName: string
    phone: string
    email?: string
  }
  address: {
    department: string
    municipality: string
    exactAddress: string
    reference?: string
  }
  items: ValidatedOrderItem[]
  paymentMethod: 'CASH_ON_DELIVERY'
}

/**
 * Valida exhaustivamente el payload de creación de pedido según RF-030, RF-031, RN-011.
 * Si algún campo es inválido, lanza AppError.badRequest sin consultar base de datos ni inventario.
 */
export function validateCreateOrderPayload(payload: unknown): ValidatedOrderData {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw AppError.badRequest('El cuerpo de la solicitud debe ser un objeto JSON válido')
  }

  const { customer, address, items, paymentMethod } = payload as Record<string, unknown>

  // --- Validación de Cliente (RF-031) ---
  if (typeof customer !== 'object' || customer === null || Array.isArray(customer)) {
    throw AppError.badRequest('Los datos del cliente son obligatorios y deben ser un objeto')
  }

  const custObj = customer as Record<string, unknown>
  const fullName = typeof custObj.fullName === 'string' ? custObj.fullName.trim() : ''
  const phone = typeof custObj.phone === 'string' ? custObj.phone.trim() : ''
  const email = typeof custObj.email === 'string' ? custObj.email.trim() : undefined

  if (!fullName) {
    throw AppError.badRequest('El nombre completo del cliente es obligatorio')
  }
  if (!phone) {
    throw AppError.badRequest('El teléfono del cliente es obligatorio')
  }

  // --- Validación de Dirección (RF-031) ---
  if (typeof address !== 'object' || address === null || Array.isArray(address)) {
    throw AppError.badRequest('La dirección de entrega es obligatoria y debe ser un objeto')
  }

  const addrObj = address as Record<string, unknown>
  const department = typeof addrObj.department === 'string' ? addrObj.department.trim() : ''
  const municipality = typeof addrObj.municipality === 'string' ? addrObj.municipality.trim() : ''
  const exactAddress = typeof addrObj.exactAddress === 'string' ? addrObj.exactAddress.trim() : ''
  const reference = typeof addrObj.reference === 'string' ? addrObj.reference.trim() : undefined

  if (!department) {
    throw AppError.badRequest('El departamento de entrega es obligatorio')
  }
  if (!municipality) {
    throw AppError.badRequest('El municipio de entrega es obligatorio')
  }
  if (!exactAddress) {
    throw AppError.badRequest('La dirección exacta de entrega es obligatoria')
  }

  // --- Método de Pago (RF-031) ---
  if (paymentMethod !== 'CASH_ON_DELIVERY') {
    throw AppError.badRequest('El único método de pago aceptado es pago contra entrega (CASH_ON_DELIVERY)')
  }

  // --- Ítems y Cantidades (RF-030, RN-011) ---
  if (!Array.isArray(items) || items.length === 0) {
    throw AppError.badRequest('El pedido debe contener al menos un producto')
  }

  const validatedItems: ValidatedOrderItem[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw AppError.badRequest(`El producto en la posición ${i + 1} no tiene un formato válido`)
    }

    const itemObj = item as Record<string, unknown>
    const productId = typeof itemObj.productId === 'string' ? itemObj.productId.trim() : ''
    const variantId = typeof itemObj.variantId === 'string' && itemObj.variantId.trim()
      ? itemObj.variantId.trim()
      : undefined
    const rawQty = itemObj.quantity

    if (!productId) {
      throw AppError.badRequest(`El identificador del producto en la posición ${i + 1} es obligatorio`)
    }

    if (
      typeof rawQty !== 'number' ||
      !Number.isFinite(rawQty) ||
      !Number.isInteger(rawQty) ||
      rawQty <= 0
    ) {
      throw AppError.badRequest(
        `La cantidad para el producto "${productId}" debe ser un número entero positivo mayor a cero`
      )
    }

    validatedItems.push({
      productId,
      ...(variantId ? { variantId } : {}),
      quantity: rawQty,
    })
  }

  return {
    customer: {
      fullName,
      phone,
      ...(email ? { email } : {}),
    },
    address: {
      department,
      municipality,
      exactAddress,
      ...(reference ? { reference } : {}),
    },
    items: validatedItems,
    paymentMethod: 'CASH_ON_DELIVERY',
  }
}
