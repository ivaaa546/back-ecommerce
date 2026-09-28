import { Request, Response, NextFunction } from 'express'
import * as settingsService from './settings.service'
import { ShippingType } from '../../types/domain'

export async function getSettings(req: Request, res: Response, next: NextFunction) {
  try {
    const settings = await settingsService.getSettings()
    res.json({
      storeName: settings.storeName,
      quickLinksActive: settings.quickLinksActive,
      quickLinks: settings.quickLinks,
      shipping: { type: settings.shippingType, amount: settings.shippingAmount },
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
    if (!storeName) return res.status(400).json({ message: 'storeName es requerido' })
    const settings = await settingsService.updateStoreName(storeName)
    res.json(settings)
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
    const settings = await settingsService.updateShipping({ type: type as ShippingType, amount })
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
    const result = await settingsService.updateBannerSlider(banners)
    res.json(result)
  } catch (err) { next(err) }
}
