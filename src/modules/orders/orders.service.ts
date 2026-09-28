import { prisma } from '../../lib/prisma'
import { OrderStatus, ShippingType } from '../../types/domain'
import { canTransitionTo, calculateOrderTotals } from '../../types/domain.rules'

interface OrderItem {
  productId: string
  quantity: number
}

interface CreateOrderData {
  customer: { fullName: string; phone: string; email?: string }
  address: { department: string; municipality: string; exactAddress: string; reference?: string }
  items: OrderItem[]
  paymentMethod: 'CASH_ON_DELIVERY'
}

// Genera el siguiente número de pedido con formato #0001 (RT-003)
async function generateOrderNumber(): Promise<string> {
  const count = await prisma.order.count()
  return `#${String(count + 1).padStart(4, '0')}`
}

// T-023 — Creación de pedido con transacción atómica (RT-001)
export async function createOrder(data: CreateOrderData) {
  return prisma.$transaction(async (tx) => {
    // Obtener costo de envío vigente
    const settings = await tx.setting.findFirst()
    const shippingCost = settings?.shippingType === ShippingType.FREE ? 0 : Number(settings?.shippingAmount ?? 30)

    // Verificar stock y obtener snapshots de productos
    const itemsWithProducts = await Promise.all(
      data.items.map(async (item) => {
        const product = await tx.product.findUniqueOrThrow({ where: { id: item.productId } })

        // RN-001 / RN-002: validar stock
        if (product.stock <= 0) {
          throw Object.assign(new Error(`Producto "${product.name}" sin stock`), { statusCode: 400 })
        }
        if (item.quantity > product.stock) {
          throw Object.assign(
            new Error(`Stock insuficiente para "${product.name}". Disponible: ${product.stock}`),
            { statusCode: 400 }
          )
        }

        return { product, quantity: item.quantity }
      })
    )

    // Descontar stock
    await Promise.all(
      itemsWithProducts.map(({ product, quantity }) =>
        tx.product.update({
          where: { id: product.id },
          data: { stock: product.stock - quantity },
        })
      )
    )

    // Calcular totales
    const { subtotal, total } = calculateOrderTotals(
      itemsWithProducts.map(({ product, quantity }) => ({
        unitPrice: Number(product.price),
        quantity,
      })),
      shippingCost
    )

    const orderNumber = await generateOrderNumber()

    const order = await tx.order.create({
      data: {
        orderNumber,
        subtotal,
        shippingCost,
        total,
        customerName: data.customer.fullName,
        customerPhone: data.customer.phone,
        customerEmail: data.customer.email,
        department: data.address.department,
        municipality: data.address.municipality,
        exactAddress: data.address.exactAddress,
        reference: data.address.reference,
        items: {
          create: itemsWithProducts.map(({ product, quantity }) => ({
            productId: product.id,
            productName: product.name,
            unitPrice: product.price,
            quantity,
          })),
        },
      },
      include: { items: true },
    })

    return order
  })
}

// T-024 — Gestión admin
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
    throw Object.assign(new Error('Pedido no encontrado'), { statusCode: 404 })
  }
  return order
}

export async function advanceStatus(id: string, newStatus: OrderStatus) {
  const order = await prisma.order.findUniqueOrThrow({ where: { id } })

  // RN-006: validar transición secuencial
  if (!canTransitionTo(order.status, newStatus)) {
    throw Object.assign(
      new Error(`Transición inválida: ${order.status} → ${newStatus}`),
      { statusCode: 400 }
    )
  }

  return prisma.order.update({ where: { id }, data: { status: newStatus } })
}
