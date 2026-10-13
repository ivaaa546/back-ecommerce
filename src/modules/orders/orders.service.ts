import { prisma } from '../../lib/prisma'
import { AppError } from '../../lib/errors'
import { OrderStatus, ShippingType, PaymentMethod, EntityStatus } from '../../types/domain'
import {
  canTransitionTo,
  calculateOrderTotals,
  consolidateOrderItems,
  canCancelOrder,
  canReturnOrder,
} from '../../types/domain.rules'
import { AuthoritativeOrderResponse, AuthoritativeOrderItem } from '../../types/orders.contract'
import { ValidatedOrderData } from './orders.validation'
import {
  reserveOrderInventory,
  shipOrderInventory,
  releaseOrderInventory,
  restoreOrderInventory,
} from '../inventory/inventory.service'

/**
 * Genera el siguiente número de pedido único y creciente desde la secuencia de PostgreSQL (T-011, T-016, DT-003).
 */
export async function generateOrderNumber(tx?: any): Promise<string> {
  const client = tx ?? prisma
  for (let attempt = 0; attempt < 5; attempt++) {
    let orderNum = ''
    try {
      const res = await client.$queryRaw<Array<{ num: string }>>`SELECT generate_next_order_number() as num;`
      if (res[0]?.num) orderNum = res[0].num
    } catch {
      try {
        const res = await client.$queryRaw<Array<{ val: bigint | number }>>`SELECT nextval('order_number_seq') as val;`
        const val = res[0]?.val ? Number(res[0].val) : 1
        orderNum = `#${String(val).padStart(4, '0')}`
      } catch {
        const count = await client.order.count()
        orderNum = `#${String(count + 1).padStart(4, '0')}`
      }
    }

    if (!orderNum) {
      const count = await client.order.count()
      orderNum = `#${String(count + 1).padStart(4, '0')}`
    }

    const exists = await client.order.findUnique({ where: { orderNumber: orderNum } })
    if (!exists) {
      return orderNum
    }
  }

  const count = await client.order.count()
  return `#${String(count + 1).padStart(4, '0')}`
}

/**
 * Crea un pedido con validación atómica, consolidación de líneas, descuento condicional de stock
 * y generación de números únicos (T-014, T-015, T-016, DT-001, DT-002, DT-003).
 */
export async function createOrder(data: ValidatedOrderData): Promise<AuthoritativeOrderResponse> {
  // DT-001: Consolidar líneas repetidas por productId antes de interactuar con la persistencia
  const consolidatedItems = consolidateOrderItems(data.items)

  return prisma.$transaction(async (tx) => {
    // 1. Obtener costo de envío vigente de la configuración
    const settings = await tx.setting.findFirst()
    const shippingCost = settings?.shippingType === ShippingType.FREE ? 0 : Number(settings?.shippingAmount ?? 30)

    // 2. Verificar existencia, estado activo y obtener snapshots de los productos
    const productIds = Array.from(new Set(consolidatedItems.map((i) => i.productId)))
    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
      include: { variants: true },
    })

    if (products.length !== productIds.length) {
      const foundIds = new Set(products.map((p) => p.id))
      const missing = productIds.filter((id) => !foundIds.has(id))
      throw AppError.notFound(`Uno o más productos no existen: ${missing.join(', ')}`)
    }

    const productsMap = new Map(products.map((p) => [p.id, p]))

    interface PreparedOrderItem {
      productId: string
      variantId?: string | null
      productName: string
      variantName?: string | null
      sku: string
      unitPrice: number
      quantity: number
    }

    const preparedItems: PreparedOrderItem[] = []

    // Verificar que todos los productos y variantes estén activos y tengan stock suficiente
    for (const item of consolidatedItems) {
      const prod = productsMap.get(item.productId)!
      if (prod.status !== EntityStatus.ACTIVE) {
        throw AppError.badRequest(`El producto "${prod.name}" no está disponible para la venta`)
      }

      if (item.variantId) {
        const variant = prod.variants.find((v) => v.id === item.variantId)
        if (!variant) {
          throw AppError.notFound(`La variante seleccionada no existe para el producto "${prod.name}"`)
        }
        if (variant.status !== EntityStatus.ACTIVE) {
          throw AppError.badRequest(`La variante "${variant.name}" de "${prod.name}" no está disponible para la venta`)
        }
        if (variant.stock < item.quantity) {
          throw AppError.stockConflict(
            `Stock insuficiente para "${prod.name} (${variant.name})". Disponible: ${variant.stock}, Solicitado: ${item.quantity}`
          )
        }

        preparedItems.push({
          productId: prod.id,
          variantId: variant.id,
          productName: `${prod.name} - ${variant.name}`,
          variantName: variant.name,
          sku: variant.sku,
          unitPrice: Number(variant.price),
          quantity: item.quantity,
        })
      } else {
        // Producto simple: verificar si exige selección de variante obligatoria (RN-002)
        const activeVariants = prod.variants.filter((v) => v.status === EntityStatus.ACTIVE)
        if (activeVariants.length > 0) {
          throw AppError.badRequest(`El producto "${prod.name}" requiere selección de variante`)
        }

        if (prod.stock < item.quantity) {
          throw AppError.stockConflict(
            `Stock insuficiente para "${prod.name}". Disponible: ${prod.stock}, Solicitado: ${item.quantity}`
          )
        }

        preparedItems.push({
          productId: prod.id,
          variantId: null,
          productName: prod.name,
          variantName: null,
          sku: prod.sku,
          unitPrice: Number(prod.price),
          quantity: item.quantity,
        })
      }
    }

    // 3. Calcular importes autoritativos de servidor con precisión monetaria (T-006, DT-005)
    const itemsForCalculation = preparedItems.map((item) => ({
      unitPrice: item.unitPrice,
      quantity: item.quantity,
    }))

    const { subtotal, total } = calculateOrderTotals(itemsForCalculation, shippingCost)

    // 4. T-016: Generar número de pedido único y creciente
    const orderNumber = await generateOrderNumber(tx)

    // 5. Persistir el pedido y las líneas consolidadas
    const createdOrder = await tx.order.create({
      data: {
        orderNumber,
        status: OrderStatus.PENDIENTE,
        subtotal,
        shippingCost,
        total,
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        customerName: data.customer.fullName,
        customerPhone: data.customer.phone,
        customerEmail: data.customer.email,
        department: data.address.department,
        municipality: data.address.municipality,
        exactAddress: data.address.exactAddress,
        reference: data.address.reference,
        items: {
          create: preparedItems.map((item) => ({
            productId: item.productId,
            variantId: item.variantId ?? null,
            productName: item.productName,
            variantName: item.variantName ?? null,
            sku: item.sku,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
          })),
        },
      },
      include: { items: true },
    })

    // 6. T-003, DT-004, DT-005: Reserva atómica de inventario dentro de la transacción
    await reserveOrderInventory(
      tx,
      createdOrder.id,
      orderNumber,
      preparedItems.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        sku: item.sku,
        quantity: item.quantity,
      }))
    )

    // 7. Retornar contrato autoritativo completo (T-008)
    const responseItems: AuthoritativeOrderItem[] = createdOrder.items.map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      productName: i.productName,
      variantName: i.variantName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      lineTotal: Number(i.unitPrice) * i.quantity,
    }))

    const authoritativeResponse: AuthoritativeOrderResponse = {
      orderId: createdOrder.id,
      orderNumber: createdOrder.orderNumber,
      status: createdOrder.status as OrderStatus,
      items: responseItems,
      subtotal: Number(createdOrder.subtotal),
      shippingCost: Number(createdOrder.shippingCost),
      total: Number(createdOrder.total),
      currency: 'GTQ',
      customer: {
        fullName: createdOrder.customerName,
        phone: createdOrder.customerPhone,
        ...(createdOrder.customerEmail ? { email: createdOrder.customerEmail } : {}),
      },
      createdAt: createdOrder.createdAt.toISOString(),
    }

    return authoritativeResponse
  })
}

// Gestión admin (CU-007)
export async function listAll(filters: { status?: OrderStatus }) {
  return prisma.order.findMany({
    where: filters.status ? { status: filters.status } : undefined,
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getById(id: string) {
  const order = await prisma.order.findUnique({ where: { id }, include: { items: true } })
  if (!order) {
    throw AppError.notFound('Pedido no encontrado')
  }
  return order
}

// Gestión de Cancelaciones y Devoluciones con ciclo de inventario (T-003, DT-004)
export async function cancelOrder(id: string, reason: string, actor: string = 'ADMIN') {
  const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Cancelación de pedido'
  const cleanActor = typeof actor === 'string' && actor.trim() ? actor.trim() : 'ADMIN'

  return prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({ where: { id }, include: { items: true } })
    if (!existing) {
      throw AppError.notFound('Pedido no encontrado')
    }

    if (existing.status === OrderStatus.CANCELADO) {
      throw AppError.conflict('El pedido ya ha sido cancelado previamente')
    }

    if (!canCancelOrder(existing.status as OrderStatus)) {
      throw AppError.badRequest(
        `No es posible cancelar un pedido en estado "${existing.status}". Solo se permite cancelar pedidos antes de su despacho.`
      )
    }

    await releaseOrderInventory(tx, id, cleanReason, cleanActor)

    return tx.order.findUniqueOrThrow({ where: { id }, include: { items: true, returnItems: true } })
  })
}

export interface ReturnItemInput {
  orderItemId: string
  quantity: number
  condition: 'APTO_VENTA' | 'DANADO' | 'INSPECCION'
  restocked?: boolean
}

export async function returnOrder(
  id: string,
  reason: string,
  actor: string = 'ADMIN',
  returnItems?: ReturnItemInput[]
) {
  const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Devolución de pedido'
  const cleanActor = typeof actor === 'string' && actor.trim() ? actor.trim() : 'ADMIN'

  return prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({ where: { id }, include: { items: true } })
    if (!existing) {
      throw AppError.notFound('Pedido no encontrado')
    }

    if (existing.status === OrderStatus.DEVUELTO) {
      throw AppError.conflict('El pedido ya ha sido devuelto previamente')
    }

    if (!canReturnOrder(existing.status as OrderStatus)) {
      throw AppError.badRequest(
        `Solo se pueden devolver pedidos en estado "${OrderStatus.ENTREGADO}" o "${OrderStatus.RETORNANDO}". Estado actual: "${existing.status}".`
      )
    }

    await restoreOrderInventory(tx, id, cleanReason, cleanActor, returnItems)

    return tx.order.findUniqueOrThrow({ where: { id }, include: { items: true, returnItems: true } })
  })
}

export async function markOrderReturning(id: string, reason: string, actor: string = 'ADMIN') {
  const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Paquete no entregado'
  const cleanActor = typeof actor === 'string' && actor.trim() ? actor.trim() : 'ADMIN'

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id } })
    if (!order) throw AppError.notFound('Pedido no encontrado')
    if (order.status !== OrderStatus.ENVIADO) {
      throw AppError.badRequest(`Solo se puede iniciar el retorno desde "${OrderStatus.ENVIADO}"`)
    }

    return tx.order.update({
      where: { id },
      data: {
        status: OrderStatus.RETORNANDO,
        returningAt: new Date(),
        returningReason: cleanReason,
        returningBy: cleanActor,
      },
      include: { items: true },
    })
  })
}

export async function advanceStatus(
  id: string,
  newStatus: OrderStatus,
  reason?: string,
  actor?: string
) {
  if (newStatus === OrderStatus.CANCELADO) {
    return cancelOrder(id, reason || 'Cancelado por administración', actor || 'ADMIN')
  }

  if (newStatus === OrderStatus.DEVUELTO) {
    return returnOrder(id, reason || 'Devolución procesada por administración', actor || 'ADMIN')
  }

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id } })

    // RN-006: validar transición secuencial
    if (!canTransitionTo(order.status as OrderStatus, newStatus)) {
      throw AppError.badRequest(`Transición de estado inválida: ${order.status} → ${newStatus}`)
    }

    if (newStatus === OrderStatus.ENVIADO) {
      await shipOrderInventory(tx, id)
    }

    return tx.order.update({
      where: { id },
      data: { status: newStatus },
      include: { items: true },
    })
  })
}
