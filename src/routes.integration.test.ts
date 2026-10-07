import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import jwt from 'jsonwebtoken'
import { resetAndSeedIsolatedDb } from '../scripts/setup-test-db'

describe('T-017, T-018, T-019, T-020: API, Autenticación y Contratos Seguros', () => {
  let server: Server
  let baseUrl: string
  const jwtSecret = process.env.JWT_SECRET || 'test_secret'

  before(async () => {
    process.env.JWT_SECRET = jwtSecret
    await resetAndSeedIsolatedDb()
    const { default: app } = await import('./app')
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address()
        if (addr && typeof addr === 'object') {
          baseUrl = `http://127.0.0.1:${addr.port}`
        }
        resolve()
      })
    })
  })

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  // T-018: Distinción de token ausente, inválido y expirado
  it('T-018: Rechaza petición administrativa sin token con 401 y MISSING_TOKEN', async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`)
    assert.equal(res.status, 401)
    const data = (await res.json()) as any
    assert.equal(data.code, 'UNAUTHORIZED')
    assert.equal(data.message, 'Token de autenticación requerido')
    assert.equal(data.details?.reason, 'MISSING_TOKEN')
  })

  it('T-018: Rechaza petición administrativa con token inválido con 401 e INVALID_TOKEN', async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: { Authorization: 'Bearer token_totalmente_invalido.123.abc' },
    })
    assert.equal(res.status, 401)
    const data = (await res.json()) as any
    assert.equal(data.code, 'UNAUTHORIZED')
    assert.equal(data.message, 'Token de autenticación inválido')
    assert.equal(data.details?.reason, 'INVALID_TOKEN')
  })

  it('T-018: Rechaza petición administrativa con token expirado con 401 y TOKEN_EXPIRED', async () => {
    const expiredToken = jwt.sign(
      { id: 'admin-1', email: 'admin@test.com' },
      jwtSecret,
      { expiresIn: '-1s' } // Ya expirado
    )
    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    })
    assert.equal(res.status, 401)
    const data = (await res.json()) as any
    assert.equal(data.code, 'UNAUTHORIZED')
    assert.equal(data.message, 'Token de autenticación expirado')
    assert.equal(data.details?.reason, 'TOKEN_EXPIRED')
  })

  it('T-018: Permite acceso a ruta administrativa con token válido', async () => {
    const validToken = jwt.sign(
      { id: 'admin-1', email: 'admin@test.com' },
      jwtSecret,
      { expiresIn: '1h' }
    )
    const res = await fetch(`${baseUrl}/api/admin/products`, {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.ok(Array.isArray(data))
  })

  // T-017: Contrato de errores seguro y sin fugas
  it('T-017: Errores de validación devuelven 400 INVALID_INPUT sin stack trace ni SQL', async () => {
    const res = await fetch(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer: { fullName: '' } }), // Payload inválido
    })
    assert.equal(res.status, 400)
    const data = (await res.json()) as any
    assert.equal(data.code, 'INVALID_INPUT')
    assert.ok(data.message)
    // No debe contener fugas internas
    assert.equal(data.stack, undefined)
    assert.equal(data.prisma, undefined)
    assert.equal(data.sql, undefined)
  })

  it('T-017: Solicitud de producto no existente devuelve 404 NOT_FOUND seguro', async () => {
    const res = await fetch(`${baseUrl}/api/products/slug-inexistente-123456`)
    assert.equal(res.status, 404)
    const data = (await res.json()) as any
    assert.equal(data.code, 'NOT_FOUND')
    assert.equal(data.message, 'Producto no encontrado')
  })

  // T-019: Uploads y Settings con errores recuperables
  it('T-019: Subida de archivo sin datos devuelve 400 seguro sin error no controlado', async () => {
    const validToken = jwt.sign({ id: 'admin-1', email: 'admin@test.com' }, jwtSecret, { expiresIn: '1h' })
    const res = await fetch(`${baseUrl}/api/admin/uploads`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(res.status, 400)
    const data = (await res.json()) as any
    assert.equal(data.code, 'INVALID_INPUT')
    assert.equal(data.message, 'No se recibió ningún archivo')
  })

  // T-020: Exponer datos vigentes para reconciliación del carrito
  it('T-020: GET /api/products con filtro ids expone datos vigentes de los productos solicitados', async () => {
    const res = await fetch(`${baseUrl}/api/products?ids=test-prod-1,test-prod-2`)
    assert.equal(res.status, 200)
    const products = (await res.json()) as any
    assert.ok(Array.isArray(products))
    assert.ok(products.length >= 2)
    const p1 = products.find((p: any) => p.id === 'test-prod-1')
    assert.ok(p1)
    assert.equal(p1.name, 'Camisa Casual')
    assert.ok(!isNaN(Number(p1.price)))
    assert.equal(typeof p1.stock, 'number')
    assert.ok(Array.isArray(p1.images))
  })

  it('T-020: GET /api/settings expone costo y tipo de envío vigentes y marca existente', async () => {
    const res = await fetch(`${baseUrl}/api/settings`)
    assert.equal(res.status, 200)
    const settings = (await res.json()) as any
    assert.ok(settings.storeName)
    assert.ok(settings.shipping)
    assert.ok(['FREE', 'FIXED'].includes(settings.shipping.type))
    assert.equal(typeof settings.shipping.amount, 'number')
    assert.ok(Array.isArray(settings.banners))
  })
})
