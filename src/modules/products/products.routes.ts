import { Router } from 'express'
import * as ctrl from './products.controller'
import { authMiddleware } from '../../middlewares/auth.middleware'

// Rutas públicas
export const productsRouter = Router()
productsRouter.get('/', ctrl.listActive)
productsRouter.get('/:slug', ctrl.getBySlug)

// Rutas admin
export const productsAdminRouter = Router()
productsAdminRouter.use(authMiddleware)
productsAdminRouter.get('/', ctrl.listAll)
productsAdminRouter.post('/', ctrl.create)
productsAdminRouter.put('/:id', ctrl.update)
productsAdminRouter.patch('/:id/status', ctrl.toggleStatus)
productsAdminRouter.patch('/:id/stock', ctrl.updateStock)
productsAdminRouter.patch('/:id/featured', ctrl.toggleFeatured)
productsAdminRouter.delete('/:id', ctrl.remove)
