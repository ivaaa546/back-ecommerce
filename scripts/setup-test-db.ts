import 'dotenv/config'
import { PrismaClient, EntityStatus, ShippingType, PaymentMethod, OrderStatus } from '@prisma/client'

const baseUrl = process.env.DATABASE_URL || ''
const testUrl = baseUrl.includes('?') 
  ? `${baseUrl}&schema=test_isolated`
  : `${baseUrl}?schema=test_isolated`

// Las pruebas automatizadas deben cargar el Prisma singleton de la app contra el schema aislado.
if (process.env.NODE_ENV === 'test' || process.env.npm_lifecycle_event === 'test') {
  process.env.DATABASE_URL = testUrl
}

// Cliente raíz en public para reiniciar el schema
const rootPrisma = new PrismaClient({
  datasources: { db: { url: baseUrl } },
})

// Cliente conectado exclusivamente al schema aislado
export const testPrisma = new PrismaClient({
  datasources: { db: { url: testUrl } },
})

export async function resetAndSeedIsolatedDb() {
  console.log('🔄 1. Reiniciando esquema aislado test_isolated...')
  await rootPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS test_isolated CASCADE;`)
  await rootPrisma.$executeRawUnsafe(`CREATE SCHEMA test_isolated;`)
  
  // Ejecutar migraciones completas (incluye secuencias, funciones y constraints)
  const { execSync } = await import('node:child_process')
  execSync(
    `DATABASE_URL="${testUrl}" npx prisma migrate deploy`,
    { stdio: 'inherit' }
  )

  console.log('🌱 2. Sembrando datos representativos en test_isolated...')
  
  // Settings
  await testPrisma.setting.create({
    data: {
      storeName: 'TEST STORE',
      shippingType: ShippingType.FIXED,
      shippingAmount: 30.0,
      footerTagline: 'Tienda de prueba aislada',
      footerCopyright: 'Ambiente de pruebas automatizadas',
    },
  })

  // Admin
  await testPrisma.admin.create({
    data: {
      email: 'admin@test.com',
      passwordHash: '$2b$10$w8.3f679e9Q4cO.testHashForLocalTesting1234567890',
    },
  })

  // Categoría
  const cat = await testPrisma.category.create({
    data: {
      name: 'Ropa',
      slug: 'ropa',
      status: EntityStatus.ACTIVE,
    },
  })

  // Productos con stock conocido
  const prod1 = await testPrisma.product.create({
    data: {
      id: 'test-prod-1',
      name: 'Camisa Casual',
      slug: 'camisa-casual',
      description: 'Camisa 100% algodón',
      price: 150.0,
      stock: 10,
      sku: 'CAM-001',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
      status: EntityStatus.ACTIVE,
      featured: true,
      categoryId: cat.id,
    },
  })

  const prod2 = await testPrisma.product.create({
    data: {
      id: 'test-prod-2',
      name: 'Pantalón Denim',
      slug: 'pantalon-denim',
      description: 'Pantalón clásico',
      price: 250.5,
      stock: 5,
      sku: 'PAN-001',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      status: EntityStatus.ACTIVE,
      featured: false,
      categoryId: cat.id,
    },
  })

  // Pedido representativo
  await testPrisma.order.create({
    data: {
      orderNumber: '#0001',
      status: OrderStatus.PENDIENTE,
      subtotal: 150.0,
      shippingCost: 30.0,
      total: 180.0,
      customerName: 'Cliente Prueba',
      customerPhone: '55554444',
      customerEmail: 'cliente@test.com',
      department: 'Guatemala',
      municipality: 'Guatemala',
      exactAddress: 'Avenida Las Américas 1-00',
      paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
      items: {
        create: [
          {
            productId: prod1.id,
            quantity: 1,
            unitPrice: 150.0,
            productName: prod1.name,
          },
        ],
      },
    },
  })

  // Sincronizar secuencia order_number_seq con los pedidos existentes
  await testPrisma.$executeRawUnsafe(`
    SELECT setval('order_number_seq', (SELECT COALESCE(MAX(NULLIF(regexp_replace("orderNumber", '[^0-9]', '', 'g'), '')::INTEGER), 1) FROM "orders"), true);
  `)

  console.log('✅ Ambiente aislado test_isolated reiniciado y sembrado exitosamente.')
}

async function main() {
  await resetAndSeedIsolatedDb()
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('Error al configurar ambiente aislado:', err)
      process.exit(1)
    })
    .finally(async () => {
      await testPrisma.$disconnect()
      await rootPrisma.$disconnect()
    })
}
