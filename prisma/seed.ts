import 'dotenv/config'
import { PrismaClient, ShippingType } from '@prisma/client'
import bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed...')

  // --- Admin único (T-006, PAT-001) ---
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@ecommerce.com'
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123'

  const existingAdmin = await prisma.admin.findUnique({ where: { email: adminEmail } })

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 10)
    await prisma.admin.create({
      data: { email: adminEmail, passwordHash },
    })
    console.log(`✅ Admin creado: ${adminEmail}`)
  } else {
    console.log(`ℹ️  Admin ya existe: ${adminEmail}`)
  }

  // --- Configuración inicial (T-015, RN-010) ---
  const settingsCount = await prisma.setting.count()

  if (settingsCount === 0) {
    await prisma.setting.create({
      data: {
        shippingType: ShippingType.FIXED,
        shippingAmount: 30,
        bannerImageUrl: null,
        bannerText: null,
        bannerLinkUrl: null,
      },
    })
    console.log('✅ Configuración inicial creada (envío Q30.00)')
  } else {
    console.log('ℹ️  Configuración ya existe')
  }

  console.log('✅ Seed completado')
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
