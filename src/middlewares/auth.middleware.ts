import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { AppError } from '../lib/errors'

interface AdminPayload {
  id: string
  email: string
}

// Extiende Request para incluir el admin autenticado
declare global {
  namespace Express {
    interface Request {
      admin?: AdminPayload
    }
  }
}

export function authMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Token de autenticación requerido', { reason: 'MISSING_TOKEN' }))
  }

  const token = authHeader.split(' ')[1]
  if (!token || token.trim() === '') {
    return next(new AppError(401, 'UNAUTHORIZED', 'Token de autenticación requerido', { reason: 'MISSING_TOKEN' }))
  }

  try {
    const secret = process.env.JWT_SECRET
    if (!secret) {
      return next(AppError.internal('JWT_SECRET no configurado'))
    }

    const payload = jwt.verify(token, secret) as AdminPayload
    req.admin = payload
    next()
  } catch (err: any) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Token de autenticación expirado', { reason: 'TOKEN_EXPIRED' }))
    }
    if (err instanceof jwt.JsonWebTokenError) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Token de autenticación inválido', { reason: 'INVALID_TOKEN' }))
    }
    return next(new AppError(401, 'UNAUTHORIZED', 'Token de autenticación inválido', { reason: 'INVALID_TOKEN' }))
  }
}
