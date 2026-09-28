import { Router } from 'express'
import * as ctrl from './orders.controller'
import { authMiddleware } from '../../middlewares/auth.middleware'

// Ruta pública
export const ordersRouter = Router()
ordersRouter.post('/', ctrl.createOrder)

// Rutas admin
export const ordersAdminRouter = Router()
ordersAdminRouter.use(authMiddleware)
ordersAdminRouter.get('/', ctrl.listAll)
ordersAdminRouter.get('/:id', ctrl.getById)
ordersAdminRouter.patch('/:id/status', ctrl.advanceStatus)
