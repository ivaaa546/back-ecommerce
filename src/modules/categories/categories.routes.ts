import { Router } from 'express'
import * as ctrl from './categories.controller'
import { authMiddleware } from '../../middlewares/auth.middleware'

export const categoriesRouter = Router({ mergeParams: true })

// Rutas públicas
categoriesRouter.get('/', ctrl.listActive)

// Rutas admin (protegidas)
const adminRouter = Router()
adminRouter.use(authMiddleware)
adminRouter.get('/', ctrl.listAll)
adminRouter.post('/', ctrl.create)
adminRouter.put('/:id', ctrl.update)
adminRouter.patch('/:id/status', ctrl.toggleStatus)
adminRouter.delete('/:id', ctrl.remove)

export { adminRouter as categoriesAdminRouter }
