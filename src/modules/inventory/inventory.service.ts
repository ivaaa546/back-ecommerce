import { prisma } from '../../lib/prisma'
import { Prisma, InventoryMovementType, EntityStatus } from '@prisma/client'
import { AppError } from '../../lib/errors'
import {
  InventoryFilter,
  InventoryItem,
  AdjustmentPayload,
  InventoryMovementDTO,
  InventoryListResponse,
} from './inventory.types'

type PrismaTx = Prisma.TransactionClient

export interface ResolvedTarget {
  kind: 'variant' | 'product'
  id: string
  productId: string
  variantId: string | null
  sku: string
  productName: string
  variantName: string | null
  stock: number
  reservedStock: number
  price: number
  status: EntityStatus
}

export async function resolveTarget(
  idOrSku: string,
  tx: PrismaTx | typeof prisma = prisma
): Promise<ResolvedTarget> {
  const clean = idOrSku.trim()

  if (clean.startsWith('var:')) {
    const varId = clean.slice(4)
    const variant = await tx.productVariant.findUnique({
      where: { id: varId },
      include: { product: true },
    })
    if (!variant) throw AppError.notFound('Variante no encontrada en inventario')
    return {
      kind: 'variant',
      id: `var:${variant.id}`,
      productId: variant.productId,
      variantId: variant.id,
      sku: variant.sku,
      productName: variant.product.name,
      variantName: variant.name,
      stock: variant.stock,
      reservedStock: variant.reservedStock,
      price: Number(variant.price),
      status: variant.status,
    }
  }

  if (clean.startsWith('prod:')) {
    const prodId = clean.slice(5)
    const product = await tx.product.findUnique({
      where: { id: prodId },
    })
    if (!product) throw AppError.notFound('Producto no encontrado en inventario')
    return {
      kind: 'product',
      id: `prod:${product.id}`,
      productId: product.id,
      variantId: null,
      sku: product.sku,
      productName: product.name,
      variantName: null,
      stock: product.stock,
      reservedStock: product.reservedStock,
      price: Number(product.price),
      status: product.status,
    }
  }

  // Búsqueda genérica por id o sku
  const variant = await tx.productVariant.findFirst({
    where: { OR: [{ id: clean }, { sku: clean }] },
    include: { product: true },
  })
  if (variant) {
    return {
      kind: 'variant',
      id: `var:${variant.id}`,
      productId: variant.productId,
      variantId: variant.id,
      sku: variant.sku,
      productName: variant.product.name,
      variantName: variant.name,
      stock: variant.stock,
      reservedStock: variant.reservedStock,
      price: Number(variant.price),
      status: variant.status,
    }
  }

  const product = await tx.product.findFirst({
    where: { OR: [{ id: clean }, { sku: clean }] },
  })
  if (product) {
    return {
      kind: 'product',
      id: `prod:${product.id}`,
      productId: product.id,
      variantId: null,
      sku: product.sku,
      productName: product.name,
      variantName: null,
      stock: product.stock,
      reservedStock: product.reservedStock,
      price: Number(product.price),
      status: product.status,
    }
  }

  throw AppError.notFound('Artículo de inventario no encontrado')
}

export async function listInventoryItems(params: {
  search?: string
  filter?: InventoryFilter
  page?: number
  limit?: number
}): Promise<InventoryListResponse> {
  const page = Math.max(1, Number(params.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20))
  const search = params.search?.trim().toLowerCase() || ''
  const filter = params.filter || 'all'

  // 1. Obtener productos simples (sin variantes)
  const products = await prisma.product.findMany({
    include: {
      variants: {
        select: { id: true },
      },
    },
    orderBy: { sku: 'asc' },
  })

  // 2. Obtener todas las variantes con su producto padre
  const variants = await prisma.productVariant.findMany({
    include: {
      product: true,
    },
    orderBy: { sku: 'asc' },
  })

  const allItems: InventoryItem[] = []

  // Si un producto no tiene variantes, es un SKU inventariable independiente (RN-001)
  for (const prod of products) {
    if (prod.variants.length === 0) {
      allItems.push({
        id: `prod:${prod.id}`,
        productId: prod.id,
        variantId: null,
        sku: prod.sku,
        productName: prod.name,
        variantName: null,
        stock: prod.stock,
        reservedStock: prod.reservedStock,
        availableStock: Math.max(0, prod.stock - prod.reservedStock),
        price: Number(prod.price),
        status: prod.status,
        hasVariants: false,
      })
    }
  }

  // Agregar cada variante como fila independiente
  for (const v of variants) {
    allItems.push({
      id: `var:${v.id}`,
      productId: v.productId,
      variantId: v.id,
      sku: v.sku,
      productName: v.product.name,
      variantName: v.name,
      stock: v.stock,
      reservedStock: v.reservedStock,
      availableStock: Math.max(0, v.stock - v.reservedStock),
      price: Number(v.price),
      status: v.status,
      hasVariants: true,
    })
  }

  // Filtrado por texto (búsqueda por nombre de producto, variante o sku)
  let filtered = allItems
  if (search) {
    filtered = filtered.filter((item) => {
      const matchSku = item.sku.toLowerCase().includes(search)
      const matchProduct = item.productName.toLowerCase().includes(search)
      const matchVariant = item.variantName ? item.variantName.toLowerCase().includes(search) : false
      return matchSku || matchProduct || matchVariant
    })
  }

  // Filtrado por estado de inventario (CU-006, RF-003, DT-007)
  if (filter === 'out_of_stock') {
    filtered = filtered.filter((item) => item.availableStock <= 0)
  } else if (filter === 'low_stock') {
    // Umbral fijo de 5 unidades según DT-007
    filtered = filtered.filter((item) => item.availableStock > 0 && item.availableStock <= 5)
  } else if (filter === 'has_reserved') {
    filtered = filtered.filter((item) => item.reservedStock > 0)
  }

  // Ordenar determinísticamente por SKU
  filtered.sort((a, b) => a.sku.localeCompare(b.sku))

  const total = filtered.length
  const totalPages = Math.ceil(total / limit) || 1
  const paginated = filtered.slice((page - 1) * limit, page * limit)

  return {
    items: paginated,
    total,
    page,
    limit,
    totalPages,
  }
}

export async function getInventoryItemById(idOrSku: string): Promise<InventoryItem> {
  const target = await resolveTarget(idOrSku)
  return {
    id: target.id,
    productId: target.productId,
    variantId: target.variantId,
    sku: target.sku,
    productName: target.productName,
    variantName: target.variantName,
    stock: target.stock,
    reservedStock: target.reservedStock,
    availableStock: Math.max(0, target.stock - target.reservedStock),
    price: target.price,
    status: target.status,
    hasVariants: target.kind === 'variant',
  }
}

export async function getInventoryMovements(
  idOrSku: string,
  params: { page?: number; limit?: number } = {}
): Promise<{ movements: InventoryMovementDTO[]; total: number; page: number; limit: number; totalPages: number }> {
  const target = await resolveTarget(idOrSku)
  const page = Math.max(1, Number(params.page) || 1)
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20))

  const whereClause: Prisma.InventoryMovementWhereInput = target.kind === 'variant'
    ? { OR: [{ variantId: target.variantId! }, { sku: target.sku }] }
    : { OR: [{ productId: target.productId, variantId: null }, { sku: target.sku }] }

  const [total, records] = await Promise.all([
    prisma.inventoryMovement.count({ where: whereClause }),
    prisma.inventoryMovement.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  const totalPages = Math.ceil(total / limit) || 1

  return {
    movements: records.map((r: Prisma.InventoryMovementGetPayload<Record<string, never>>) => ({
      id: r.id,
      type: r.type,
      productId: r.productId,
      variantId: r.variantId,
      sku: r.sku,
      quantityChange: r.quantityChange,
      reservedChange: r.reservedChange,
      stockAfter: r.stockAfter,
      reservedStockAfter: r.reservedStockAfter,
      reason: r.reason,
      actor: r.actor,
      orderId: r.orderId,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages,
  }
}

export async function adjustInventoryItem(
  idOrSku: string,
  payload: AdjustmentPayload,
  actor: string = 'ADMIN'
): Promise<{ item: InventoryItem; movement: InventoryMovementDTO }> {
  const cleanReason = typeof payload.reason === 'string' ? payload.reason.trim() : ''
  if (!cleanReason) {
    throw AppError.badRequest('El motivo del ajuste es obligatorio')
  }

  const cleanActor = typeof actor === 'string' && actor.trim() ? actor.trim() : 'ADMIN'
  const qty = Number(payload.quantity)

  if (!Number.isInteger(qty)) {
    throw AppError.badRequest('La cantidad del ajuste debe ser un número entero')
  }

  if (payload.type === 'INCREASE' && qty <= 0) {
    throw AppError.badRequest('Para incrementar existencias, la cantidad debe ser mayor a 0')
  }

  if (payload.type === 'DECREASE' && qty <= 0) {
    throw AppError.badRequest('Para reducir existencias, la cantidad debe ser mayor a 0')
  }

  if (payload.type === 'SET' && qty < 0) {
    throw AppError.badRequest('Las existencias no pueden ser negativas')
  }

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const target = await resolveTarget(idOrSku, tx)

    let newStock = target.stock
    if (payload.type === 'INCREASE') {
      newStock = target.stock + qty
    } else if (payload.type === 'DECREASE') {
      newStock = target.stock - qty
    } else if (payload.type === 'SET') {
      newStock = qty
    } else {
      throw AppError.badRequest('Tipo de ajuste inválido (esperado: INCREASE, DECREASE o SET)')
    }

    // RN-007 & CL-003: no permitir reducir existencias físicas por debajo de reservas
    if (newStock < target.reservedStock) {
      throw AppError.badRequest(
        `El ajuste dejaría las existencias físicas (${newStock}) por debajo de las unidades reservadas (${target.reservedStock})`
      )
    }

    // RN-003: existencias no pueden ser negativas
    if (newStock < 0) {
      throw AppError.badRequest('Las existencias no pueden ser negativas')
    }

    const quantityChange = newStock - target.stock

    if (target.kind === 'variant') {
      await tx.productVariant.update({
        where: { id: target.variantId! },
        data: { stock: newStock },
      })
    } else {
      await tx.product.update({
        where: { id: target.productId },
        data: { stock: newStock },
      })
    }

    const movement = await tx.inventoryMovement.create({
      data: {
        type: InventoryMovementType.AJUSTE_MANUAL,
        productId: target.productId,
        variantId: target.variantId,
        sku: target.sku,
        quantityChange,
        reservedChange: 0,
        stockAfter: newStock,
        reservedStockAfter: target.reservedStock,
        reason: cleanReason,
        actor: cleanActor,
      },
    })

    const updatedItem: InventoryItem = {
      id: target.id,
      productId: target.productId,
      variantId: target.variantId,
      sku: target.sku,
      productName: target.productName,
      variantName: target.variantName,
      stock: newStock,
      reservedStock: target.reservedStock,
      availableStock: Math.max(0, newStock - target.reservedStock),
      price: target.price,
      status: target.status,
      hasVariants: target.kind === 'variant',
    }

    return {
      item: updatedItem,
      movement: {
        id: movement.id,
        type: movement.type,
        productId: movement.productId,
        variantId: movement.variantId,
        sku: movement.sku,
        quantityChange: movement.quantityChange,
        reservedChange: movement.reservedChange,
        stockAfter: movement.stockAfter,
        reservedStockAfter: movement.reservedStockAfter,
        reason: movement.reason,
        actor: movement.actor,
        orderId: movement.orderId,
        createdAt: movement.createdAt.toISOString(),
      },
    }
  })
}

// -------------------------------------------------------------
// COMANDOS INTERNOS TRANSACCIONALES PARA PEDIDOS (DT-004, DT-005)
// -------------------------------------------------------------

export interface OrderItemToReserve {
  productId: string
  variantId?: string | null
  productName: string
  sku?: string | null
  quantity: number
}

export async function reserveOrderInventory(
  tx: PrismaTx,
  orderId: string,
  orderNumber: string,
  items: OrderItemToReserve[]
): Promise<void> {
  const sorted = [...items].sort((a, b) => {
    const keyA = a.variantId ? `var:${a.variantId}` : `prod:${a.productId}`
    const keyB = b.variantId ? `var:${b.variantId}` : `prod:${b.productId}`
    return keyA.localeCompare(keyB)
  })

  for (const item of sorted) {
    if (item.variantId) {
      const affectedRows = await tx.$executeRaw`
        UPDATE "product_variants"
        SET "reservedStock" = "reservedStock" + ${item.quantity}
        WHERE "id" = ${item.variantId}
          AND ("stock" - "reservedStock") >= ${item.quantity}
          AND "status" = 'ACTIVE';
      `
      if (affectedRows === 0) {
        throw AppError.stockConflict(
          `Conflicto de inventario concurrente: existencias disponibles insuficientes para "${item.productName}"`
        )
      }

      const updated = await tx.productVariant.findUniqueOrThrow({
        where: { id: item.variantId },
      })

      await tx.inventoryMovement.create({
        data: {
          type: InventoryMovementType.RESERVA_PEDIDO,
          productId: item.productId,
          variantId: item.variantId,
          sku: item.sku || updated.sku,
          quantityChange: 0,
          reservedChange: item.quantity,
          stockAfter: updated.stock,
          reservedStockAfter: updated.reservedStock,
          reason: `Reserva por pedido ${orderNumber}`,
          orderId,
        },
      })
    } else {
      const affectedRows = await tx.$executeRaw`
        UPDATE "products"
        SET "reservedStock" = "reservedStock" + ${item.quantity}
        WHERE "id" = ${item.productId}
          AND ("stock" - "reservedStock") >= ${item.quantity}
          AND "status" = 'ACTIVE';
      `
      if (affectedRows === 0) {
        throw AppError.stockConflict(
          `Conflicto de inventario concurrente: existencias disponibles insuficientes para "${item.productName}"`
        )
      }

      const updated = await tx.product.findUniqueOrThrow({
        where: { id: item.productId },
      })

      await tx.inventoryMovement.create({
        data: {
          type: InventoryMovementType.RESERVA_PEDIDO,
          productId: item.productId,
          variantId: null,
          sku: item.sku || updated.sku,
          quantityChange: 0,
          reservedChange: item.quantity,
          stockAfter: updated.stock,
          reservedStockAfter: updated.reservedStock,
          reason: `Reserva por pedido ${orderNumber}`,
          orderId,
        },
      })
    }
  }

  await tx.order.update({
    where: { id: orderId },
    data: { inventoryReserved: true },
  })
}

export async function shipOrderInventory(
  tx: PrismaTx,
  orderId: string
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order) throw AppError.notFound('Pedido no encontrado')

  // DT-006 / Idempotencia: si ya fue despachado o fue creado históricamente antes de la migración
  if (order.inventoryShipped) {
    return
  }

  const affected = await tx.$executeRaw`
    UPDATE "orders"
    SET "inventoryShipped" = true
    WHERE "id" = ${orderId} AND "inventoryShipped" = false;
  `
  if (affected === 0) return

  // Si el pedido no tenía reserva (ej. histórico o no reservado), no aplicamos segunda salida
  if (!order.inventoryReserved) {
    return
  }

  const sorted = [...order.items].sort((a, b) => {
    const keyA = a.variantId ? `var:${a.variantId}` : `prod:${a.productId}`
    const keyB = b.variantId ? `var:${b.variantId}` : `prod:${b.productId}`
    return keyA.localeCompare(keyB)
  })

  for (const item of sorted) {
    if (item.variantId) {
      await tx.$executeRaw`
        UPDATE "product_variants"
        SET "stock" = "stock" - ${item.quantity},
            "reservedStock" = "reservedStock" - ${item.quantity}
        WHERE "id" = ${item.variantId};
      `

      const updated = await tx.productVariant.findUniqueOrThrow({
        where: { id: item.variantId },
      })

      await tx.inventoryMovement.create({
        data: {
          type: InventoryMovementType.SALIDA_PEDIDO,
          productId: item.productId,
          variantId: item.variantId,
          sku: item.sku || updated.sku,
          quantityChange: -item.quantity,
          reservedChange: -item.quantity,
          stockAfter: updated.stock,
          reservedStockAfter: updated.reservedStock,
          reason: `Despacho de pedido ${order.orderNumber}`,
          orderId,
        },
      })
    } else {
      await tx.$executeRaw`
        UPDATE "products"
        SET "stock" = "stock" - ${item.quantity},
            "reservedStock" = "reservedStock" - ${item.quantity}
        WHERE "id" = ${item.productId};
      `

      const updated = await tx.product.findUniqueOrThrow({
        where: { id: item.productId },
      })

      await tx.inventoryMovement.create({
        data: {
          type: InventoryMovementType.SALIDA_PEDIDO,
          productId: item.productId,
          variantId: null,
          sku: item.sku || updated.sku,
          quantityChange: -item.quantity,
          reservedChange: -item.quantity,
          stockAfter: updated.stock,
          reservedStockAfter: updated.reservedStock,
          reason: `Despacho de pedido ${order.orderNumber}`,
          orderId,
        },
      })
    }
  }
}

export async function releaseOrderInventory(
  tx: PrismaTx,
  orderId: string,
  reason: string,
  actor: string = 'ADMIN'
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order) throw AppError.notFound('Pedido no encontrado')

  // Si ya fue liberado o cancelado, rechazar por conflicto concurrente/duplicado
  if (order.inventoryReleased || order.status === 'CANCELADO') {
    throw AppError.conflict('El pedido ya ha sido cancelado previamente')
  }

  const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Cancelación de pedido'
  const cleanActor = typeof actor === 'string' && actor.trim() ? actor.trim() : 'ADMIN'

  const affected = await tx.$executeRaw`
    UPDATE "orders"
    SET "status" = 'CANCELADO',
        "cancelledAt" = NOW(),
        "cancellationReason" = ${cleanReason},
        "cancelledBy" = ${cleanActor},
        "inventoryReleased" = true,
        "stockRestored" = true
    WHERE "id" = ${orderId}
      AND "status" IN ('PENDIENTE', 'CONFIRMADO', 'PREPARANDO')
      AND "inventoryReleased" = false;
  `
  if (affected === 0) {
    throw AppError.conflict('Conflicto concurrente al cancelar el pedido')
  }

  const sorted = [...order.items].sort((a, b) => {
    const keyA = a.variantId ? `var:${a.variantId}` : `prod:${a.productId}`
    const keyB = b.variantId ? `var:${b.variantId}` : `prod:${b.productId}`
    return keyA.localeCompare(keyB)
  })

  // Caso 1: Nuevo pedido con inventario reservado (y no despachado) -> liberar reserva
  if (order.inventoryReserved && !order.inventoryShipped) {
    for (const item of sorted) {
      if (item.variantId) {
        await tx.$executeRaw`
          UPDATE "product_variants"
          SET "reservedStock" = "reservedStock" - ${item.quantity}
          WHERE "id" = ${item.variantId} AND "reservedStock" >= ${item.quantity};
        `

        const updated = await tx.productVariant.findUniqueOrThrow({
          where: { id: item.variantId },
        })

        await tx.inventoryMovement.create({
          data: {
            type: InventoryMovementType.LIBERACION_PEDIDO,
            productId: item.productId,
            variantId: item.variantId,
            sku: item.sku || updated.sku,
            quantityChange: 0,
            reservedChange: -item.quantity,
            stockAfter: updated.stock,
            reservedStockAfter: updated.reservedStock,
            reason: `Cancelación de pedido ${order.orderNumber}: ${cleanReason}`,
            actor: cleanActor,
            orderId,
          },
        })
      } else {
        await tx.$executeRaw`
          UPDATE "products"
          SET "reservedStock" = "reservedStock" - ${item.quantity}
          WHERE "id" = ${item.productId} AND "reservedStock" >= ${item.quantity};
        `

        const updated = await tx.product.findUniqueOrThrow({
          where: { id: item.productId },
        })

        await tx.inventoryMovement.create({
          data: {
            type: InventoryMovementType.LIBERACION_PEDIDO,
            productId: item.productId,
            variantId: null,
            sku: item.sku || updated.sku,
            quantityChange: 0,
            reservedChange: -item.quantity,
            stockAfter: updated.stock,
            reservedStockAfter: updated.reservedStock,
            reason: `Cancelación de pedido ${order.orderNumber}: ${cleanReason}`,
            actor: cleanActor,
            orderId,
          },
        })
      }
    }
  } else {
    // Caso 2: Pedido histórico (donde el stock físico ya se había descontado al crearse) -> reponer stock físico
    for (const item of sorted) {
      if (item.variantId) {
        await tx.$executeRaw`
          UPDATE "product_variants"
          SET "stock" = "stock" + ${item.quantity}
          WHERE "id" = ${item.variantId};
        `

        const updated = await tx.productVariant.findUniqueOrThrow({
          where: { id: item.variantId },
        })

        await tx.inventoryMovement.create({
          data: {
            type: InventoryMovementType.REPOSICION_PEDIDO,
            productId: item.productId,
            variantId: item.variantId,
            sku: item.sku || updated.sku,
            quantityChange: item.quantity,
            reservedChange: 0,
            stockAfter: updated.stock,
            reservedStockAfter: updated.reservedStock,
            reason: `Cancelación de pedido histórico ${order.orderNumber}: ${cleanReason}`,
            actor: cleanActor,
            orderId,
          },
        })
      } else {
        await tx.$executeRaw`
          UPDATE "products"
          SET "stock" = "stock" + ${item.quantity}
          WHERE "id" = ${item.productId};
        `

        const updated = await tx.product.findUniqueOrThrow({
          where: { id: item.productId },
        })

        await tx.inventoryMovement.create({
          data: {
            type: InventoryMovementType.REPOSICION_PEDIDO,
            productId: item.productId,
            variantId: null,
            sku: item.sku || updated.sku,
            quantityChange: item.quantity,
            reservedChange: 0,
            stockAfter: updated.stock,
            reservedStockAfter: updated.reservedStock,
            reason: `Cancelación de pedido histórico ${order.orderNumber}: ${cleanReason}`,
            actor: cleanActor,
            orderId,
          },
        })
      }
    }
  }
}

export async function restoreOrderInventory(
  tx: PrismaTx,
  orderId: string,
  reason: string,
  actor: string = 'ADMIN'
): Promise<void> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  })
  if (!order) throw AppError.notFound('Pedido no encontrado')

  if (order.status === 'DEVUELTO') {
    throw AppError.conflict('El pedido ya ha sido devuelto previamente')
  }

  const cleanReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Devolución de pedido'
  const cleanActor = typeof actor === 'string' && actor.trim() ? actor.trim() : 'ADMIN'

  const affected = await tx.$executeRaw`
    UPDATE "orders"
    SET "status" = 'DEVUELTO',
        "returnedAt" = NOW(),
        "returnReason" = ${cleanReason},
        "returnedBy" = ${cleanActor},
        "stockRestored" = true
    WHERE "id" = ${orderId}
      AND "status" = 'ENTREGADO'
      AND "stockRestored" = false;
  `
  if (affected === 0) {
    throw AppError.conflict('Conflicto concurrente al procesar la devolución del pedido')
  }

  const sorted = [...order.items].sort((a, b) => {
    const keyA = a.variantId ? `var:${a.variantId}` : `prod:${a.productId}`
    const keyB = b.variantId ? `var:${b.variantId}` : `prod:${b.productId}`
    return keyA.localeCompare(keyB)
  })

  for (const item of sorted) {
    if (item.variantId) {
      await tx.$executeRaw`
        UPDATE "product_variants"
        SET "stock" = "stock" + ${item.quantity}
        WHERE "id" = ${item.variantId};
      `

      const updated = await tx.productVariant.findUniqueOrThrow({
        where: { id: item.variantId },
      })

      await tx.inventoryMovement.create({
        data: {
          type: InventoryMovementType.REPOSICION_PEDIDO,
          productId: item.productId,
          variantId: item.variantId,
          sku: item.sku || updated.sku,
          quantityChange: item.quantity,
          reservedChange: 0,
          stockAfter: updated.stock,
          reservedStockAfter: updated.reservedStock,
          reason: `Devolución de pedido ${order.orderNumber}: ${cleanReason}`,
          actor: cleanActor,
          orderId,
        },
      })
    } else {
      await tx.$executeRaw`
        UPDATE "products"
        SET "stock" = "stock" + ${item.quantity}
        WHERE "id" = ${item.productId};
      `

      const updated = await tx.product.findUniqueOrThrow({
        where: { id: item.productId },
      })

      await tx.inventoryMovement.create({
        data: {
          type: InventoryMovementType.REPOSICION_PEDIDO,
          productId: item.productId,
          variantId: null,
          sku: item.sku || updated.sku,
          quantityChange: item.quantity,
          reservedChange: 0,
          stockAfter: updated.stock,
          reservedStockAfter: updated.reservedStock,
          reason: `Devolución de pedido ${order.orderNumber}: ${cleanReason}`,
          actor: cleanActor,
          orderId,
        },
      })
    }
  }
}
