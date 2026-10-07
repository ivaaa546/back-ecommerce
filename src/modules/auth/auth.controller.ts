import { Request, Response, NextFunction } from 'express'
import * as authService from './auth.service'
import { AppError } from '../../lib/errors'

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      throw AppError.badRequest('Email y contraseña son requeridos')
    }
    const result = await authService.login(email, password)
    res.json(result)
  } catch (err) {
    next(err)
  }
}
