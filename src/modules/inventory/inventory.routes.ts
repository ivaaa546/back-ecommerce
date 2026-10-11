import { Router } from 'express'
import * as ctrl from './inventory.controller'
import { authMiddleware } from '../../middlewares/auth.middleware'

export const inventoryAdminRouter: Router = Router()

// Todas las rutas administrativas de inventario requieren autenticación (RNF-003)
inventoryAdminRouter.use(authMiddleware)

inventoryAdminRouter.get('/', ctrl.list)
inventoryAdminRouter.get('/:inventoryItemId', ctrl.getById)
inventoryAdminRouter.get('/:inventoryItemId/movements', ctrl.getMovements)
inventoryAdminRouter.post('/:inventoryItemId/adjustments', ctrl.adjust)
