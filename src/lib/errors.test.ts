import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { AppError, sanitizeError } from './errors'

describe('T-007: Contrato de errores seguro', () => {
  it('AppError.badRequest devuelve 400 y código INVALID_INPUT', () => {
    const err = AppError.badRequest('Entrada inválida', { field: 'email' })
    const { statusCode, body } = sanitizeError(err)
    assert.equal(statusCode, 400)
    assert.equal(body.code, 'INVALID_INPUT')
    assert.equal(body.message, 'Entrada inválida')
    assert.deepEqual(body.details, { field: 'email' })
  })

  it('AppError.unauthorized devuelve 401 y código UNAUTHORIZED', () => {
    const err = AppError.unauthorized()
    const { statusCode, body } = sanitizeError(err)
    assert.equal(statusCode, 401)
    assert.equal(body.code, 'UNAUTHORIZED')
    assert.equal(body.message, 'Acceso no autorizado')
  })

  it('AppError.forbidden devuelve 403 y código FORBIDDEN', () => {
    const err = AppError.forbidden()
    const { statusCode, body } = sanitizeError(err)
    assert.equal(statusCode, 403)
    assert.equal(body.code, 'FORBIDDEN')
    assert.equal(body.message, 'Acceso denegado')
  })

  it('AppError.notFound devuelve 404 y código NOT_FOUND', () => {
    const err = AppError.notFound('Producto no encontrado')
    const { statusCode, body } = sanitizeError(err)
    assert.equal(statusCode, 404)
    assert.equal(body.code, 'NOT_FOUND')
    assert.equal(body.message, 'Producto no encontrado')
  })

  it('AppError.stockConflict devuelve 409 y código STOCK_CONFLICT', () => {
    const err = AppError.stockConflict('Stock insuficiente')
    const { statusCode, body } = sanitizeError(err)
    assert.equal(statusCode, 409)
    assert.equal(body.code, 'STOCK_CONFLICT')
    assert.equal(body.message, 'Stock insuficiente')
  })

  it('AppError.priceConflict devuelve 409 y código PRICE_CONFLICT', () => {
    const err = AppError.priceConflict('El total ha cambiado')
    const { statusCode, body } = sanitizeError(err)
    assert.equal(statusCode, 409)
    assert.equal(body.code, 'PRICE_CONFLICT')
    assert.equal(body.message, 'El total ha cambiado')
  })

  it('AppError.conflict devuelve 409 y código CONFLICT', () => {
    const err = AppError.conflict('Conflicto general')
    const { statusCode, body } = sanitizeError(err)
    assert.equal(statusCode, 409)
    assert.equal(body.code, 'CONFLICT')
  })

  it('AppError.externalService devuelve 502 y código EXTERNAL_SERVICE_ERROR', () => {
    const err = AppError.externalService()
    const { statusCode, body } = sanitizeError(err)
    assert.equal(statusCode, 502)
    assert.equal(body.code, 'EXTERNAL_SERVICE_ERROR')
    assert.equal(body.message, 'El servicio externo no se encuentra disponible temporalmente')
  })

  it('AppError.internal devuelve 500 y código INTERNAL_ERROR', () => {
    const err = AppError.internal()
    const { statusCode, body } = sanitizeError(err)
    assert.equal(statusCode, 500)
    assert.equal(body.code, 'INTERNAL_ERROR')
    assert.equal(body.message, 'Ha ocurrido un error interno en el servidor')
  })

  it('sanitiza y oculta mensajes de Prisma, SQL, Cloudinary, secretos y stack traces', () => {
    const prismaError = new Error('PrismaClientKnownRequestError: Unique constraint failed on the fields: (`email`)')
    const { statusCode: status1, body: body1 } = sanitizeError(prismaError)
    assert.equal(status1, 500)
    assert.equal(body1.code, 'INTERNAL_ERROR')
    assert.equal(body1.message, 'Ha ocurrido un error interno en el servidor')
    assert.equal('stack' in body1, false)

    const sqlError = new Error('error: syntax error at or near "SELECT * FROM orders WHERE secret_key = 123"')
    const { statusCode: status2, body: body2 } = sanitizeError(sqlError)
    assert.equal(status2, 500)
    assert.equal(body2.code, 'INTERNAL_ERROR')
    assert.equal(body2.message, 'Ha ocurrido un error interno en el servidor')

    const cloudinaryError = Object.assign(new Error('Cloudinary API error: Invalid API key: 1234567890'), { statusCode: 500 })
    const { statusCode: status3, body: body3 } = sanitizeError(cloudinaryError)
    assert.equal(status3, 500)
    assert.equal(body3.code, 'INTERNAL_ERROR')
    assert.equal(body3.message, 'Ha ocurrido un error interno en el servidor')
  })
})
