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

  // --- Productos y Variantes de demostración (T-007, RF-015) ---
  const categoryCount = await prisma.category.count()
  let defaultCategory = await prisma.category.findFirst()

  if (categoryCount === 0 || !defaultCategory) {
    defaultCategory = await prisma.category.create({
      data: {
        name: 'Ropa y Calzado',
        slug: 'ropa-y-calzado',
        description: 'Prendas y calzado de alta calidad',
        status: 'ACTIVE',
      },
    })
    console.log('✅ Categoría inicial creada')
  }

  // Producto simple de ejemplo
  const simpleProduct = await prisma.product.findUnique({ where: { sku: 'PROD-SIMPLE-001' } })
  if (!simpleProduct) {
    await prisma.product.create({
      data: {
        name: 'Gorra Clásica',
        slug: 'gorra-clasica',
        description: 'Gorra ajustable 100% algodón',
        price: 75.0,
        stock: 25,
        sku: 'PROD-SIMPLE-001',
        imageUrl: 'https://images.unsplash.com/photo-1588850561407-ed78c282e89b?auto=format&fit=crop&q=80&w=600',
        images: [],
        status: 'ACTIVE',
        featured: true,
        categoryId: defaultCategory.id,
      },
    })
    console.log('✅ Producto simple inicial creado')
  }

  // Producto con variantes de ejemplo
  const variantProduct = await prisma.product.findUnique({ where: { sku: 'PROD-VAR-BASE' } })
  if (!variantProduct) {
    await prisma.product.create({
      data: {
        name: 'Camiseta Básica de Algodón',
        slug: 'camiseta-basica-algodon',
        description: 'Camiseta cómoda disponible en múltiples tallas y colores',
        price: 95.0,
        stock: 0,
        sku: 'PROD-VAR-BASE',
        imageUrl: 'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=600',
        images: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=600'],
        status: 'ACTIVE',
        featured: true,
        categoryId: defaultCategory.id,
        variants: {
          create: [
            {
              name: 'Talla S / Blanco',
              sku: 'TSH-WHT-S',
              price: 95.0,
              stock: 12,
              images: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=600'],
              status: 'ACTIVE',
            },
            {
              name: 'Talla M / Blanco',
              sku: 'TSH-WHT-M',
              price: 95.0,
              stock: 18,
              images: ['https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=600'],
              status: 'ACTIVE',
            },
            {
              name: 'Talla L / Negro',
              sku: 'TSH-BLK-L',
              price: 105.0,
              stock: 8,
              images: [],
              status: 'ACTIVE',
            },
          ],
        },
      },
    })
    console.log('✅ Producto con variantes inicial creado')
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
