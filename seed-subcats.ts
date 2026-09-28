import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Crear o buscar Línea blanca
  const lineaBlanca = await prisma.category.upsert({
    where: { slug: 'linea-blanca' },
    update: {},
    create: {
      name: 'Línea blanca',
      slug: 'linea-blanca',
      status: 'ACTIVE'
    }
  });

  // Refrigeración (Subcategoría)
  const refrigeracion = await prisma.category.upsert({
    where: { slug: 'refrigeracion' },
    update: { parentId: lineaBlanca.id },
    create: {
      name: 'Refrigeración',
      slug: 'refrigeracion',
      parentId: lineaBlanca.id,
      status: 'ACTIVE'
    }
  });

  // Refrigeradoras (Sub-subcategoría)
  await prisma.category.upsert({
    where: { slug: 'refrigeradoras' },
    update: { parentId: refrigeracion.id },
    create: {
      name: 'Refrigeradoras',
      slug: 'refrigeradoras',
      parentId: refrigeracion.id,
      status: 'ACTIVE'
    }
  });

  await prisma.category.upsert({
    where: { slug: 'frigobares' },
    update: { parentId: refrigeracion.id },
    create: {
      name: 'Frigobares',
      slug: 'frigobares',
      parentId: refrigeracion.id,
      status: 'ACTIVE'
    }
  });

  // Lavandería (Subcategoría)
  const lavanderia = await prisma.category.upsert({
    where: { slug: 'lavanderia' },
    update: { parentId: lineaBlanca.id },
    create: {
      name: 'Lavandería',
      slug: 'lavanderia',
      parentId: lineaBlanca.id,
      status: 'ACTIVE'
    }
  });

  await prisma.category.upsert({
    where: { slug: 'lavadoras' },
    update: { parentId: lavanderia.id },
    create: {
      name: 'Lavadoras',
      slug: 'lavadoras',
      parentId: lavanderia.id,
      status: 'ACTIVE'
    }
  });

  console.log('Seed de subcategorías completado.');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
