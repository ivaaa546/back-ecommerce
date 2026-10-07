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
    throw AppError.notFound('Producto no encontrado')
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
  const product = await prisma.product.findUnique({ where: { id } })
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
