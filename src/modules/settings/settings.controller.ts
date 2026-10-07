import { Request, Response, NextFunction } from 'express'
import * as settingsService from './settings.service'
import { ShippingType } from '../../types/domain'
import { AppError } from '../../lib/errors'

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await settingsService.getSettings()
    res.json({
      storeName: settings.storeName,
      logoUrl: settings.logoUrl,
      footerTagline: settings.footerTagline,
      footerCopyright: settings.footerCopyright,
      metaPixelId: settings.metaPixelId,
      quickLinksActive: settings.quickLinksActive,
      quickLinks: settings.quickLinks,
      shipping: { type: settings.shippingType, amount: Number(settings.shippingAmount) },
      banner: { // legacy
        imageUrl: settings.bannerImageUrl,
        text: settings.bannerText,
        linkUrl: settings.bannerLinkUrl,
      },
      banners: settings.banners // Nuevo array de slider
    })
  } catch (err) { next(err) }
}

export async function updateStoreName(req: Request, res: Response, next: NextFunction) {
  try {
    const { storeName } = req.body
    if (!storeName || String(storeName).trim() === '') {
      throw AppError.badRequest('storeName es requerido')
    }
    const settings = await settingsService.updateStoreName(String(storeName).trim())
    res.json(settings)
  } catch (err) { next(err) }
}

export async function updateLogo(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await settingsService.updateLogo(String(req.body.logoUrl || '').trim())
    res.json({ logoUrl: settings.logoUrl })
  } catch (err) { next(err) }
}

export async function updateFooter(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await settingsService.updateFooter({
      tagline: String(req.body.tagline || '').trim(),
      copyright: String(req.body.copyright || '').trim(),
    })
    res.json({ footerTagline: settings.footerTagline, footerCopyright: settings.footerCopyright })
  } catch (err) { next(err) }
}

export async function updateMetaPixel(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await settingsService.updateMetaPixel(String(req.body.metaPixelId || '').trim())
    res.json({ metaPixelId: settings.metaPixelId })
  } catch (err) { next(err) }
}

export async function updateQuickLinks(req: Request, res: Response, next: NextFunction) {
  try {
    const { active, links } = req.body
    const settings = await settingsService.updateQuickLinks({ active: Boolean(active), links: links || [] })
    res.json(settings)
  } catch (err) { next(err) }
}

export async function updateShipping(req: Request, res: Response, next: NextFunction) {
  try {
    const { type, amount } = req.body
    if (!type || !['FREE', 'FIXED'].includes(type)) {
      throw AppError.badRequest('Tipo de envío inválido. Debe ser FREE o FIXED')
    }
    const numAmount = amount !== undefined ? Number(amount) : undefined
    if (type === 'FIXED' && numAmount !== undefined && (isNaN(numAmount) || numAmount < 0)) {
      throw AppError.badRequest('El monto de envío debe ser un número mayor o igual a 0')
    }
    const settings = await settingsService.updateShipping({ type: type as ShippingType, amount: numAmount })
    res.json(settings)
  } catch (err) { next(err) }
}

export async function updateBanner(req: Request, res: Response, next: NextFunction) {
  try {
    const { imageUrl, text, linkUrl } = req.body
    const settings = await settingsService.updateBanner({ imageUrl, text, linkUrl })
    res.json(settings)
  } catch (err) { next(err) }
}

export async function updateBannerSlider(req: Request, res: Response, next: NextFunction) {
  try {
    const { banners } = req.body
    if (banners && !Array.isArray(banners)) {
      throw AppError.badRequest('El formato de banners debe ser una lista')
    }
    const result = await settingsService.updateBannerSlider(banners || [])
    res.json(result)
  } catch (err) { next(err) }
}
