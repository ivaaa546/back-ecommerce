import { prisma } from '../../lib/prisma'
import { EntityStatus } from '../../types/domain'
import { AppError } from '../../lib/errors'

// Público — T-020, T-021
export async function listActive(filters: { categorySlug?: string; search?: string; ids?: string[] }) {
  let categoryIds: string[] | undefined = undefined;

  if (filters.categorySlug) {
    const targetCategory = await prisma.category.findUnique({
      where: { slug: filters.categorySlug }
    });
    
    if (targetCategory) {
      // Find direct subcategories
      const subcategories = await prisma.category.findMany({
        where: { parentId: targetCategory.id }
      });
      const subIds = subcategories.map(c => c.id);
      
      // Find sub-subcategories
      const subSubcategories = subIds.length > 0 ? await prisma.category.findMany({
        where: { parentId: { in: subIds } }
      }) : [];
      
      categoryIds = [targetCategory.id, ...subIds, ...subSubcategories.map(c => c.id)];
    } else {
      categoryIds = ['not-found-id'];
    }
  }

  return prisma.product.findMany({
    where: {
      status: EntityStatus.ACTIVE,
      ...(filters.ids && filters.ids.length > 0 && { id: { in: filters.ids } }),
      ...(categoryIds && { categoryId: { in: categoryIds } }),
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search, mode: 'insensitive' } },
          { description: { contains: filters.search, mode: 'insensitive' } },
          // Búsqueda aproximada básica (quita 's' o 'es' finales para atrapar singulares/plurales)
          { name: { contains: filters.search.replace(/s$/i, ''), mode: 'insensitive' } },
          { name: { contains: filters.search.replace(/es$/i, ''), mode: 'insensitive' } }
        ]
      }),
    },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: {
        where: { status: EntityStatus.ACTIVE },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getBySlug(slug: string) {
  const product = await prisma.product.findFirst({
    where: { slug, status: EntityStatus.ACTIVE },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: {
        where: { status: EntityStatus.ACTIVE },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!product) {
    throw AppError.notFound('Producto no encontrado')
  }
  return product
}

export async function getFeatured() {
  return prisma.product.findMany({
    where: { status: EntityStatus.ACTIVE, featured: true },
    include: {
      category: { select: { id: true, name: true, slug: true } },
      variants: {
        where: { status: EntityStatus.ACTIVE },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

// Admin — T-022
export async function listAll() {
  return prisma.product.findMany({
    include: {
      category: { select: { id: true, name: true } },
      variants: {
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getById(id: string) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      variants: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!product) {
    throw AppError.notFound('Producto no encontrado')
  }
  return product
}

export async function create(data: {
  name: string; slug?: string; description: string
  price: number; previousPrice?: number; stock: number
  sku: string; imageUrl: string; images?: string[]; categoryId: string
}) {
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  return prisma.product.create({ data: { ...data, slug } })
}

export async function update(id: string, data: Partial<{
  name: string; slug: string; description: string
  price: number; previousPrice: number; stock: number
  sku: string; imageUrl: string; images: string[]; categoryId: string
}>) {
  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) {
    throw AppError.notFound('Producto no encontrado')
  }
  return prisma.product.update({ where: { id }, data })
}

export async function toggleStatus(id: string) {
  const product = await prisma.product.findUnique({ where: { id } })
  if (!product) {
    throw AppError.notFound('Producto no encontrado')
  }

  // RN-008: no activar si falta imagen, precio o categoría
  if (product.status === EntityStatus.INACTIVE) {
    if (!product.imageUrl || !product.price || !product.categoryId) {
      throw AppError.badRequest('El producto requiere imagen, precio y categoría para activarse')
    }
  }

  const newStatus = product.status === EntityStatus.ACTIVE ? EntityStatus.INACTIVE : EntityStatus.ACTIVE
  return prisma.product.update({ where: { id }, data: { status: newStatus } })
}

export async function updateStock(id: string, stock: number) {
  if (stock < 0) {
    throw AppError.badRequest('El stock no puede ser negativo')
  }
  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) {
    throw AppError.notFound('Producto no encontrado')
  }
  return prisma.product.update({ where: { id }, data: { stock } })
}

export async function toggleFeatured(id: string) {
  const product = await prisma.product.findUnique({ where: { id } })
  if (!product) {
    throw AppError.notFound('Producto no encontrado')
  }
  return prisma.product.update({ where: { id }, data: { featured: !product.featured } })
}

export async function remove(id: string) {
  const existing = await prisma.product.findUnique({ where: { id } })
  if (!existing) {
    throw AppError.notFound('Producto no encontrado')
  }
  return prisma.product.delete({ where: { id } })
}

// Gestión de variantes (T-005, RF-001)
export async function listVariants(productId: string) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) {
    throw AppError.notFound('Producto no encontrado')
  }
  return prisma.productVariant.findMany({
    where: { productId },
    orderBy: { createdAt: 'asc' },
  })
}

export async function createVariant(productId: string, data: {
  name: string
  sku: string
  price: number
  stock?: number
  images?: string[]
  status?: EntityStatus
}) {
  const product = await prisma.product.findUnique({ where: { id: productId } })
  if (!product) {
    throw AppError.notFound('Producto no encontrado')
  }

  const name = typeof data.name === 'string' ? data.name.trim() : ''
  const sku = typeof data.sku === 'string' ? data.sku.trim() : ''

  if (!name) {
    throw AppError.badRequest('El nombre de la variante es obligatorio')
  }
  if (!sku) {
    throw AppError.badRequest('El SKU de la variante es obligatorio')
  }
  if (typeof data.price !== 'number' || isNaN(data.price) || data.price < 0) {
    throw AppError.badRequest('El precio de la variante debe ser un número mayor o igual a cero')
  }
  const stock = data.stock !== undefined ? Number(data.stock) : 0
  if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
    throw AppError.badRequest('El stock de la variante debe ser un entero mayor o igual a cero')
  }

  // Verificar SKU único global (en variantes y en productos simples) (T-003, RF-003)
  const [existingVarSku, existingProdSku] = await Promise.all([
    prisma.productVariant.findUnique({ where: { sku } }),
    prisma.product.findUnique({ where: { sku } }),
  ])
  if (existingVarSku || existingProdSku) {
    throw AppError.conflict(`El SKU "${sku}" ya está registrado en el catálogo`)
  }

  return prisma.productVariant.create({
    data: {
      productId,
      name,
      sku,
      price: data.price,
      stock,
      images: data.images ?? [],
      status: data.status ?? EntityStatus.ACTIVE,
    },
  })
}

export async function updateVariant(productId: string, variantId: string, data: Partial<{
  name: string
  sku: string
  price: number
  stock: number
  images: string[]
  status: EntityStatus
}>) {
  const existing = await prisma.productVariant.findUnique({ where: { id: variantId } })
  if (!existing || existing.productId !== productId) {
    throw AppError.notFound('Variante no encontrada para este producto')
  }

  // Validación estricta de tipos (number, no null, no NaN)
  if (data.price !== undefined) {
    if (typeof data.price !== 'number' || isNaN(data.price) || data.price < 0) {
      throw AppError.badRequest('El precio de la variante debe ser un número mayor o igual a cero')
    }
  }
  if (data.stock !== undefined) {
    if (typeof data.stock !== 'number' || isNaN(data.stock) || data.stock < 0 || !Number.isInteger(data.stock)) {
      throw AppError.badRequest('El stock de la variante debe ser un entero mayor o igual a cero')
    }
  }
  if (data.sku !== undefined) {
    const sku = data.sku.trim()
    if (!sku) throw AppError.badRequest('El SKU de la variante no puede estar vacío')
    const [otherVar, prodWithSku] = await Promise.all([
      prisma.productVariant.findFirst({
        where: { sku, id: { not: variantId } },
      }),
      prisma.product.findUnique({ where: { sku } }),
    ])
    if (otherVar || prodWithSku) {
      throw AppError.conflict(`El SKU "${sku}" ya está registrado en el catálogo`)
    }
  }

  return prisma.productVariant.update({
    where: { id: variantId },
    data: {
      ...(data.name !== undefined && { name: data.name.trim() }),
      ...(data.sku !== undefined && { sku: data.sku.trim() }),
      ...(data.price !== undefined && { price: data.price }),
      ...(data.stock !== undefined && { stock: data.stock }),
      ...(data.images !== undefined && { images: data.images }),
      ...(data.status !== undefined && { status: data.status }),
    },
  })
}

export async function deleteVariant(productId: string, variantId: string) {
  const existing = await prisma.productVariant.findUnique({ where: { id: variantId } })
  if (!existing || existing.productId !== productId) {
    throw AppError.notFound('Variante no encontrada para este producto')
  }

  // Si tiene historial en pedidos, desactivar en lugar de borrar físicamente (Hallazgo 8)
  const orderItemsCount = await prisma.orderItem.count({ where: { variantId } })
  if (orderItemsCount > 0) {
    return prisma.productVariant.update({
      where: { id: variantId },
      data: { status: EntityStatus.INACTIVE },
    })
  }

  return prisma.productVariant.delete({ where: { id: variantId } })
}
