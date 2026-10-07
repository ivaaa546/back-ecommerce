export type ErrorCategory =
  | 'INVALID_INPUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'STOCK_CONFLICT'
  | 'PRICE_CONFLICT'
  | 'CONFLICT'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'INTERNAL_ERROR'

export interface PublicErrorBody {
  code: ErrorCategory
  message: string
  details?: unknown
}

export class AppError extends Error {
  public readonly statusCode: number
  public readonly code: ErrorCategory
  public readonly details?: unknown

  constructor(statusCode: number, code: ErrorCategory, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.statusCode = statusCode
    this.code = code
    this.details = details
    Object.setPrototypeOf(this, new.target.prototype)
  }

  static badRequest(message: string, details?: unknown): AppError {
    return new AppError(400, 'INVALID_INPUT', message, details)
  }

  static unauthorized(message = 'Acceso no autorizado'): AppError {
    return new AppError(401, 'UNAUTHORIZED', message)
  }

  static forbidden(message = 'Acceso denegado'): AppError {
    return new AppError(403, 'FORBIDDEN', message)
  }

  static notFound(message = 'Recurso no encontrado'): AppError {
    return new AppError(404, 'NOT_FOUND', message)
  }

  static stockConflict(message = 'Inventario insuficiente para completar el pedido', details?: unknown): AppError {
    return new AppError(409, 'STOCK_CONFLICT', message, details)
  }

  static priceConflict(message = 'Los precios o el costo de envío han cambiado', details?: unknown): AppError {
    return new AppError(409, 'PRICE_CONFLICT', message, details)
  }

  static conflict(message = 'Conflicto en la operación', details?: unknown): AppError {
    return new AppError(409, 'CONFLICT', message, details)
  }

  static externalService(message = 'El servicio externo no se encuentra disponible temporalmente'): AppError {
    return new AppError(502, 'EXTERNAL_SERVICE_ERROR', message)
  }

  static internal(message = 'Ha ocurrido un error interno en el servidor'): AppError {
    return new AppError(500, 'INTERNAL_ERROR', message)
  }
}

/**
 * Sanitiza cualquier error para asegurar que nunca se filtren
 * mensajes internos de Prisma, base de datos, Cloudinary, secretos ni trazas.
 */
export function sanitizeError(err: unknown): { statusCode: number; body: PublicErrorBody } {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      body: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    }
  }

  // Errores con statusCode manual pero sin clase AppError
  if (typeof err === 'object' && err !== null && 'statusCode' in err && typeof (err as any).statusCode === 'number') {
    const status = (err as any).statusCode
    const rawMessage = typeof (err as any).message === 'string' ? (err as any).message : ''
    
    // Si es un error 400/401/403/404/409, podemos conservar el mensaje si no parece interno
    const isClientError = status >= 400 && status < 500
    const looksInternal = /prisma|sql|jwt expired|jwt malformed|cloudinary|secret|password|database|connect/i.test(rawMessage)

    const code: ErrorCategory =
      status === 400 ? 'INVALID_INPUT' :
      status === 401 ? 'UNAUTHORIZED' :
      status === 403 ? 'FORBIDDEN' :
      status === 404 ? 'NOT_FOUND' :
      status === 409 ? 'CONFLICT' : 'INTERNAL_ERROR'

    return {
      statusCode: status,
      body: {
        code,
        message: isClientError && !looksInternal && rawMessage ? rawMessage : getStandardMessage(code),
      },
    }
  }

  // Error inesperado o interno (500)
  return {
    statusCode: 500,
    body: {
      code: 'INTERNAL_ERROR',
      message: 'Ha ocurrido un error interno en el servidor',
    },
  }
}

function getStandardMessage(code: ErrorCategory): string {
  switch (code) {
    case 'INVALID_INPUT': return 'Datos de entrada inválidos'
    case 'UNAUTHORIZED': return 'Acceso no autorizado'
    case 'FORBIDDEN': return 'Acceso denegado'
    case 'NOT_FOUND': return 'Recurso no encontrado'
    case 'STOCK_CONFLICT': return 'Conflicto de inventario'
    case 'PRICE_CONFLICT': return 'Conflicto de precios'
    case 'CONFLICT': return 'Conflicto en la operación'
    case 'EXTERNAL_SERVICE_ERROR': return 'Error de servicio externo'
    case 'INTERNAL_ERROR':
    default:
      return 'Ha ocurrido un error interno en el servidor'
  }
}
