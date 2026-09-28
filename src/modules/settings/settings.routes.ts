import { Router } from 'express'
import * as ctrl from './settings.controller'
import { authMiddleware } from '../../middlewares/auth.middleware'

export const settingsRouter = Router()
settingsRouter.get('/', ctrl.getSettings)

export const settingsAdminRouter = Router()
settingsAdminRouter.use(authMiddleware)
settingsAdminRouter.put('/shipping', ctrl.updateShipping)
settingsAdminRouter.put('/store-name', ctrl.updateStoreName)
settingsAdminRouter.put('/quick-links', ctrl.updateQuickLinks)
settingsAdminRouter.put('/banner', ctrl.updateBanner) // Legacy
settingsAdminRouter.put('/banners', ctrl.updateBannerSlider)
