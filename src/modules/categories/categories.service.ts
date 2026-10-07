import { prisma } from '../../lib/prisma'
import { EntityStatus } from '../../types/domain'
import { AppError } from '../../lib/errors'

// Público — T-019
export async function listActive() {
  return prisma.category.findMany({
    where: { status: EntityStatus.ACTIVE, parentId: null },
    orderBy: { name: 'asc' },
    include: {
      subCategories: {
        where: { status: EntityStatus.ACTIVE },
        orderBy: { name: 'asc' },
        include: {
          subCategories: {
            where: { status: EntityStatus.ACTIVE },
            orderBy: { name: 'asc' },
          }
        }
      }
    }
  })
}

// Admin — T-020
export async function listAll() {
  return prisma.category.findMany({ 
    orderBy: { createdAt: 'desc' },
    include: { parent: true, subCategories: true }
  })
}

export async function create(data: {
  name: string
  slug?: string
  description?: string
  imageUrl?: string
  parentId?: string
}) {
  const slug = data.slug || data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
  return prisma.category.create({ data: { ...data, slug } })
}

export async function update(
  id: string,
  data: { name?: string; slug?: string; description?: string; imageUrl?: string; parentId?: string | null }
) {
  const existing = await prisma.category.findUnique({ where: { id } })
  if (!existing) {
    throw AppError.notFound('Categoría no encontrada')
  }
  return prisma.category.update({ where: { id }, data })
}

export async function toggleStatus(id: string) {
  const category = await prisma.category.findUnique({ where: { id } })
  if (!category) {
    throw AppError.notFound('Categoría no encontrada')
  }
  const newStatus = category.status === EntityStatus.ACTIVE ? EntityStatus.INACTIVE : EntityStatus.ACTIVE
  return prisma.category.update({ where: { id }, data: { status: newStatus } })
}

export async function remove(id: string) {
  const existing = await prisma.category.findUnique({ where: { id } })
  if (!existing) {
    throw AppError.notFound('Categoría no encontrada')
  }
  // RN-007: no eliminar si tiene productos activos
  const activeProducts = await prisma.product.count({
    where: { categoryId: id, status: EntityStatus.ACTIVE },
  })
  if (activeProducts > 0) {
    throw AppError.badRequest('No se puede eliminar una categoría con productos activos')
  }
  return prisma.category.delete({ where: { id } })
}
