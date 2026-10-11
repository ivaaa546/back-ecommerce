import { Request, Response, NextFunction } from 'express'
import * as inventoryService from './inventory.service'
import { InventoryFilter, AdjustmentPayload } from './inventory.types'

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { search, filter, page, limit } = req.query

    const result = await inventoryService.listInventoryItems({
      search: typeof search === 'string' ? search : undefined,
      filter: (typeof filter === 'string' ? filter : undefined) as InventoryFilter | undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })

    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const inventoryItemId = String(req.params.inventoryItemId)
    const item = await inventoryService.getInventoryItemById(inventoryItemId)
    res.json(item)
  } catch (err) {
    next(err)
  }
}

export async function getMovements(req: Request, res: Response, next: NextFunction) {
  try {
    const inventoryItemId = String(req.params.inventoryItemId)
    const { page, limit } = req.query

    const result = await inventoryService.getInventoryMovements(inventoryItemId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    })

    res.json(result)
  } catch (err) {
    next(err)
  }
}

export async function adjust(req: Request, res: Response, next: NextFunction) {
  try {
    const inventoryItemId = String(req.params.inventoryItemId)
    const payload: AdjustmentPayload = req.body
    const actor = (req as any).admin?.email || 'ADMIN'

    const result = await inventoryService.adjustInventoryItem(inventoryItemId, payload, actor)
    res.status(200).json(result)
  } catch (err) {
    next(err)
  }
}
