import 'dotenv/config'
import { PrismaClient, EntityStatus, ShippingType, PaymentMethod, OrderStatus } from '@prisma/client'

const baseUrl = process.env.DATABASE_URL || ''
const testUrl = baseUrl.includes('?') 
  ? `${baseUrl}&schema=test_isolated`
  : `${baseUrl}?schema=test_isolated`

// Las pruebas automatizadas deben cargar el Prisma singleton de la app contra el schema aislado.
process.env.DATABASE_URL = testUrl

// Cliente raíz en public para reiniciar el schema
const rootPrisma = new PrismaClient({
  datasources: { db: { url: baseUrl } },
})

// Cliente conectado exclusivamente al schema aislado
export const testPrisma = new PrismaClient({
  datasources: { db: { url: testUrl } },
})

let isInitialized = false

async function seedData() {
  console.log('🌱 Sembrando datos representativos en test_isolated...')
  
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

  // Producto con variantes representativo (T-007, RF-015)
  const prodWithVariants = await testPrisma.product.create({
    data: {
      id: 'test-prod-variants',
      name: 'Playera Deportiva',
      slug: 'playera-deportiva',
      description: 'Playera transpirable con variantes de talla y color',
      price: 120.0,
      stock: 0, // En productos con variantes, el stock reside en las variantes
      sku: 'PLAY-BASE',
      imageUrl: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
      images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
      status: EntityStatus.ACTIVE,
      featured: true,
      categoryId: cat.id,
      variants: {
        create: [
          {
            id: 'test-var-1',
            name: 'Talla M / Azul',
            sku: 'PLAY-M-BLU',
            price: 120.0,
            stock: 10,
            images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'],
            status: EntityStatus.ACTIVE,
          },
          {
            id: 'test-var-2',
            name: 'Talla L / Rojo',
            sku: 'PLAY-L-RED',
            price: 130.0,
            stock: 2,
            images: [],
            status: EntityStatus.ACTIVE,
          },
          {
            id: 'test-var-3',
            name: 'Talla XL / Negro',
            sku: 'PLAY-XL-BLK',
            price: 140.0,
            stock: 0, // Sin stock para pruebas de stock insuficiente
            images: [],
            status: EntityStatus.ACTIVE,
          },
        ],
      },
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

export async function resetAndSeedIsolatedDb(force = false) {
  if (isInitialized && !force) {
    try {
      await testPrisma.inventoryMovement.deleteMany()
      await testPrisma.orderItem.deleteMany()
      await testPrisma.order.deleteMany()
      await testPrisma.productVariant.deleteMany()
      await testPrisma.product.deleteMany()
      await testPrisma.category.deleteMany()
      await testPrisma.admin.deleteMany()
      await testPrisma.setting.deleteMany()
      await seedData()
      return
    } catch {
      // Si la limpieza falló por desconexión del pooler, proceder con reinicio completo
    }
  }

  console.log('🔄 1. Reiniciando esquema aislado test_isolated...')
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await rootPrisma.$disconnect().catch(() => {})
      await rootPrisma.$connect()
      await rootPrisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS test_isolated CASCADE;`)
      await rootPrisma.$executeRawUnsafe(`CREATE SCHEMA test_isolated;`)
      break
    } catch (err) {
      if (attempt === 3) throw err
      await new Promise((r) => setTimeout(r, 1000 * attempt))
    }
  }
  
  // Ejecutar migraciones completas (incluye secuencias, funciones y constraints)
  const { execSync } = await import('node:child_process')
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      execSync(
        `DATABASE_URL="${testUrl}" npx prisma migrate deploy`,
        { stdio: 'inherit' }
      )
      break
    } catch (err) {
      if (attempt === 3) throw err
      await new Promise((r) => setTimeout(r, 1500 * attempt))
    }
  }

  // Desconectar y reconectar testPrisma para limpiar conexiones cerradas por el pooler tras la migración
  try {
    await testPrisma.$disconnect()
    await testPrisma.$connect()
  } catch {}

  await seedData()
  isInitialized = true
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
