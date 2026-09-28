import { Request, Response, NextFunction } from 'express'

interface AppError extends Error {
  statusCode?: number
}

export function errorMiddleware(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500
  const message = err.message ?? 'Error interno del servidor'

  console.error(`[ERROR] ${statusCode} - ${message}`)

  res.status(statusCode).json({ message })
}
