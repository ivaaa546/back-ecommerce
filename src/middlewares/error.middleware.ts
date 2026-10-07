import { Request, Response, NextFunction } from 'express'
import { sanitizeError } from '../lib/errors'

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const { statusCode, body } = sanitizeError(err)

  // Log interno para depuración segura del servidor
  const logMessage = err instanceof Error ? err.message : String(err)
  console.error(`[ERROR] ${statusCode} (${body.code}) - ${logMessage}`)

  res.status(statusCode).json(body)
}
