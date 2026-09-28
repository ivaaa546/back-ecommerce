import { PrismaClient } from '@prisma/client'

// Singleton del cliente Prisma (evita múltiples instancias en desarrollo con hot-reload)
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
