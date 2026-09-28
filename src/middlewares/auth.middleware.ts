import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

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

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Token de autenticación requerido' })
    return
  }

  const token = authHeader.split(' ')[1]

  try {
    const secret = process.env.JWT_SECRET
    if (!secret) throw new Error('JWT_SECRET no configurado')

    const payload = jwt.verify(token, secret) as AdminPayload
    req.admin = payload
    next()
  } catch {
    res.status(401).json({ message: 'Token inválido o expirado' })
  }
}
