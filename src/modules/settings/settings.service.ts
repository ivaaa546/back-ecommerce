import { prisma } from '../../lib/prisma'
import { ShippingType } from '../../types/domain'

// T-025
export async function getSettings() {
  let settings = await prisma.setting.findFirst()
  if (!settings) {
    settings = await prisma.setting.create({
      data: { shippingType: ShippingType.FIXED, shippingAmount: 30 },
    })
  }
  
  const banners = await prisma.bannerSlide.findMany({
    orderBy: { order: 'asc' }
  });

  const defaultQuickLinks = [
    { text: '🔥 Ofertas', url: '/productos' },
    { text: '✨ Lo + Nuevo', url: '/productos' },
    { text: '📱 Tecnología', url: '/productos?category=tecnologia' },
    { text: '👟 Moda', url: '/productos?category=moda' },
    { text: '🚚 Envíos', url: '#' },
    { text: '💬 WhatsApp', url: '#' },
  ];

  return { 
    ...settings, 
    quickLinks: settings.quickLinks || defaultQuickLinks,
    banners 
  }
}

export async function updateShipping(data: { type: ShippingType; amount?: number }) {
  const settings = await getSettings()
  return prisma.setting.update({
    where: { id: settings.id },
    data: {
      shippingType: data.type,
      shippingAmount: data.type === ShippingType.FREE ? 0 : (data.amount ?? 30),
    },
  })
}

export async function updateStoreName(storeName: string) {
  const settings = await getSettings()
  return prisma.setting.update({
    where: { id: settings.id },
    data: { storeName },
  })
}

export async function updateQuickLinks(data: { active: boolean, links: any[] }) {
  const settings = await getSettings()
  return prisma.setting.update({
    where: { id: settings.id },
    data: {
      quickLinksActive: data.active,
      quickLinks: data.links
    },
  })
}

// Mantener por compatibilidad backward
export async function updateBanner(data: {
  imageUrl?: string
  text?: string
  linkUrl?: string
}) {
  const settings = await getSettings()
  return prisma.setting.update({
    where: { id: settings.id },
    data: {
      bannerImageUrl: data.imageUrl,
      bannerText: data.text,
      bannerLinkUrl: data.linkUrl,
    },
  })
}

export async function updateBannerSlider(banners: { imageUrl: string, text?: string, linkUrl?: string }[]) {
  // Elimina los actuales
  await prisma.bannerSlide.deleteMany();
  
  // Inserta los nuevos
  if (banners && banners.length > 0) {
    const dataToInsert = banners.map((b, index) => ({
      imageUrl: b.imageUrl,
      text: b.text || null,
      linkUrl: b.linkUrl || null,
      order: index
    }));
    await prisma.bannerSlide.createMany({ data: dataToInsert });
  }
  
  return prisma.bannerSlide.findMany({ orderBy: { order: 'asc' } });
}
