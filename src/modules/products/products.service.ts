import { prisma } from '../../lib/prisma'
import { EntityStatus } from '../../types/domain'

// Público — T-021
export async function listActive(filters: { categorySlug?: string; search?: string }) {
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
      ...(categoryIds && { categoryId: { in: categoryIds } }),
      ...(filters.search && { name: { contains: filters.search, mode: 'insensitive' } }),
    },
    include: { category: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getBySlug(slug: string) {
  const product = await prisma.product.findFirst({
    where: { slug, status: EntityStatus.ACTIVE },
    include: { category: { select: { id: true, name: true, slug: true } } },
  })
  if (!product) {
    const error = new Error('Producto no encontrado') as Error & { statusCode: number }
    error.statusCode = 404
    throw error
  }
  return product
}

export async function getFeatured() {
  return prisma.product.findMany({
    where: { status: EntityStatus.ACTIVE, featured: true },
    include: { category: { select: { id: true, name: true, slug: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

// Admin — T-022
export async function listAll() {
  return prisma.product.findMany({
    include: { category: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getById(id: string) {
  return prisma.product.findUniqueOrThrow({ where: { id } })
}

export async function create(data: {
  name: string; slug?: string; description: string
  price: number; previousPrice?: number; stock: number
  sku: string; imageUrl: string; categoryId: string
}) {
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  return prisma.product.create({ data: { ...data, slug } })
}

export async function update(id: string, data: Partial<{
  name: string; slug: string; description: string
  price: number; previousPrice: number; stock: number
  sku: string; imageUrl: string; categoryId: string
}>) {
  return prisma.product.update({ where: { id }, data })
}

export async function toggleStatus(id: string) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id } })

  // RN-008: no activar si falta imagen, precio o categoría
  if (product.status === EntityStatus.INACTIVE) {
    if (!product.imageUrl || !product.price || !product.categoryId) {
      const error = new Error('El producto requiere imagen, precio y categoría para activarse') as Error & { statusCode: number }
      error.statusCode = 400
      throw error
    }
  }

  const newStatus = product.status === EntityStatus.ACTIVE ? EntityStatus.INACTIVE : EntityStatus.ACTIVE
  return prisma.product.update({ where: { id }, data: { status: newStatus } })
}

export async function updateStock(id: string, stock: number) {
  if (stock < 0) {
    const error = new Error('El stock no puede ser negativo') as Error & { statusCode: number }
    error.statusCode = 400
    throw error
  }
  return prisma.product.update({ where: { id }, data: { stock } })
}

export async function toggleFeatured(id: string) {
  const product = await prisma.product.findUniqueOrThrow({ where: { id } })
  return prisma.product.update({ where: { id }, data: { featured: !product.featured } })
}

export async function remove(id: string) {
  return prisma.product.delete({ where: { id } })
}
