import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import jwt from 'jsonwebtoken'
import { resetAndSeedIsolatedDb } from '../../../scripts/setup-test-db'

describe('T-004: API administrativa de Inventario (rutas protegidas, filtros, detalle, ajustes)', () => {
  let server: Server
  let baseUrl: string
  const jwtSecret = process.env.JWT_SECRET || 'test_secret'
  let validToken: string

  before(async () => {
    process.env.JWT_SECRET = jwtSecret
    await resetAndSeedIsolatedDb(true)

    validToken = jwt.sign(
      { id: 'admin-123', email: 'admin@test.com' },
      jwtSecret,
      { expiresIn: '1h' }
    )

    const { default: app } = await import('../../app')
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

  it('Rechaza petición a /api/admin/inventory sin token con 401 (RNF-003)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/inventory`)
    assert.equal(res.status, 401)
    const body = (await res.json()) as any
    assert.equal(body.code, 'UNAUTHORIZED')
  })

  it('GET /api/admin/inventory lista ítems paginados con token válido (RF-001, RF-002)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/inventory?page=1&limit=10`, {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(res.status, 200)
    const body = (await res.json()) as any
    assert.ok(Array.isArray(body.items))
    assert.ok(body.total >= 4)
    assert.ok(body.items.some((i: any) => i.sku === 'CAM-001'))
    assert.ok(body.items.some((i: any) => i.sku === 'PLAY-M-BLU'))
  })

  it('GET /api/admin/inventory con filtro out_of_stock devuelve solo agotados (RF-003)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/inventory?filter=out_of_stock`, {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(res.status, 200)
    const body = (await res.json()) as any
    assert.ok(body.items.every((i: any) => i.availableStock <= 0))
    assert.ok(body.items.some((i: any) => i.sku === 'PLAY-XL-BLK'))
  })

  it('GET /api/admin/inventory/:id retorna detalle del SKU (RF-002)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/inventory/CAM-001`, {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(res.status, 200)
    const item = (await res.json()) as any
    assert.equal(item.sku, 'CAM-001')
    assert.equal(item.productName, 'Camisa Casual')
    assert.equal(typeof item.stock, 'number')
    assert.equal(typeof item.reservedStock, 'number')
    assert.equal(typeof item.availableStock, 'number')
  })

  it('POST /api/admin/inventory/:id/adjustments aplica aumento válido y registra movimiento (RF-006, RF-007)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/inventory/CAM-001/adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        type: 'INCREASE',
        quantity: 4,
        reason: 'Reposición física en bodega',
      }),
    })
    assert.equal(res.status, 200)
    const body = (await res.json()) as any
    assert.ok(body.item)
    assert.ok(body.movement)
    assert.equal(body.movement.type, 'AJUSTE_MANUAL')
    assert.equal(body.movement.quantityChange, 4)
    assert.equal(body.movement.reason, 'Reposición física en bodega')

    // GET movements
    const movRes = await fetch(`${baseUrl}/api/admin/inventory/CAM-001/movements`, {
      headers: { Authorization: `Bearer ${validToken}` },
    })
    assert.equal(movRes.status, 200)
    const movBody = (await movRes.json()) as any
    assert.ok(Array.isArray(movBody.movements))
    assert.ok(movBody.movements.length >= 1)
  })

  it('POST /api/admin/inventory/:id/adjustments rechaza ajuste sin motivo (CL-004)', async () => {
    const res = await fetch(`${baseUrl}/api/admin/inventory/CAM-001/adjustments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validToken}`,
      },
      body: JSON.stringify({
        type: 'INCREASE',
        quantity: 2,
        reason: '   ',
      }),
    })
    assert.equal(res.status, 400)
    const body = (await res.json()) as any
    assert.equal(body.code, 'INVALID_INPUT')
  })
})
