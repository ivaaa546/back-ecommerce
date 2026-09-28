import { Request, Response, NextFunction } from 'express'
import * as authService from './auth.service'

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      res.status(400).json({ message: 'Email y contraseña son requeridos' })
      return
    }
    const result = await authService.login(email, password)
    res.json(result)
  } catch (err) {
    next(err)
  }
}
