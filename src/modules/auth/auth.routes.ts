import { Router } from 'express'
import * as authController from './auth.controller'

export const authRouter = Router()

// POST /api/auth/login
authRouter.post('/login', authController.login)
