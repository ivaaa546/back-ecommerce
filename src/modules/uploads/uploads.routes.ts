import { Router } from 'express'
import multer from 'multer'
import * as ctrl from './uploads.controller'
import { authMiddleware } from '../../middlewares/auth.middleware'

const storage = multer.memoryStorage()
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }) // 5MB max

export const uploadsRouter = Router()
uploadsRouter.use(authMiddleware)
uploadsRouter.post('/', upload.single('file'), ctrl.upload)
