import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateCreateOrderPayload } from './orders.validation'
import { AppError } from '../../lib/errors'

describe('T-005: validateCreateOrderPayload', () => {
  const validPayload = {
    customer: {
      fullName: 'Juan Pérez',
      phone: '12345678',
      email: 'juan@example.com',
    },
    address: {
      department: 'Guatemala',
      municipality: 'Guatemala',
      exactAddress: 'Zona 1, 5ta Avenida 10-20',
      reference: 'Frente al parque',
    },
    paymentMethod: 'CASH_ON_DELIVERY',
    items: [
      { productId: 'prod-1', quantity: 2 },
    ],
  }

  it('acepta un payload válido con todos los datos requeridos', () => {
    const result = validateCreateOrderPayload(validPayload)
    assert.equal(result.customer.fullName, 'Juan Pérez')
    assert.equal(result.customer.phone, '12345678')
    assert.equal(result.customer.email, 'juan@example.com')
    assert.equal(result.address.department, 'Guatemala')
    assert.equal(result.address.municipality, 'Guatemala')
    assert.equal(result.address.exactAddress, 'Zona 1, 5ta Avenida 10-20')
    assert.equal(result.paymentMethod, 'CASH_ON_DELIVERY')
    assert.equal(result.items.length, 1)
    assert.equal(result.items[0].productId, 'prod-1')
    assert.equal(result.items[0].quantity, 2)
  })

  it('rechaza payload si no es un objeto', () => {
    assert.throws(
      () => validateCreateOrderPayload(null),
      (err: unknown) => err instanceof AppError && err.statusCode === 400 && err.code === 'INVALID_INPUT'
    )
    assert.throws(
      () => validateCreateOrderPayload('cadena'),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
    assert.throws(
      () => validateCreateOrderPayload([]),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
  })

  it('rechaza cliente ausente o incompleto', () => {
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, customer: undefined }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, customer: { fullName: '', phone: '12345678' } }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, customer: { fullName: 'Juan', phone: '   ' } }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
  })

  it('rechaza dirección incompleta', () => {
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, address: { department: '', municipality: 'X', exactAddress: 'Y' } }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, address: { department: 'X', municipality: '', exactAddress: 'Y' } }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, address: { department: 'X', municipality: 'Y', exactAddress: '' } }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
  })

  it('rechaza método de pago distinto de CASH_ON_DELIVERY', () => {
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, paymentMethod: 'CREDIT_CARD' }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400 && err.message.includes('CASH_ON_DELIVERY')
    )
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, paymentMethod: undefined }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
  })

  it('rechaza lista de ítems vacía o no array', () => {
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, items: [] }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, items: null }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
  })

  it('rechaza cantidades negativas, cero, decimales, texto o ausentes', () => {
    // Cero
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, items: [{ productId: 'p1', quantity: 0 }] }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
    // Negativa
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, items: [{ productId: 'p1', quantity: -5 }] }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
    // Decimal / fraccionario
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, items: [{ productId: 'p1', quantity: 1.5 }] }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
    // Texto
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, items: [{ productId: 'p1', quantity: '2' as any }] }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
    // Ausente / undefined
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, items: [{ productId: 'p1', quantity: undefined as any }] }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
    // NaN
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, items: [{ productId: 'p1', quantity: NaN }] }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
  })

  it('rechaza productId vacío', () => {
    assert.throws(
      () => validateCreateOrderPayload({ ...validPayload, items: [{ productId: '   ', quantity: 1 }] }),
      (err: unknown) => err instanceof AppError && err.statusCode === 400
    )
  })
})
