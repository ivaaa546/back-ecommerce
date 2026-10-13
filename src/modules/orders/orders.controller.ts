import { Request, Response, NextFunction } from 'express'
import * as ordersService from './orders.service'
import { validateCreateOrderPayload } from './orders.validation'
import { OrderStatus } from '../../types/domain'

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const validatedData = validateCreateOrderPayload(req.body)
    const order = await ordersService.createOrder(validatedData)
    res.status(201).json(order)
  } catch (err) { next(err) }
}

export async function listAll(req: Request, res: Response, next: NextFunction) {
  try {
    const { status } = req.query
    const orders = await ordersService.listAll({
      status: status as OrderStatus | undefined,
    })
    res.json(orders)
  } catch (err) { next(err) }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await ordersService.getById(req.params.id as string)
    res.json(order)
  } catch (err) { next(err) }
}

export async function advanceStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = (req as any).admin?.email || req.body.actor || 'ADMIN'
    const order = await ordersService.advanceStatus(
      req.params.id as string,
      req.body.status,
      req.body.reason,
      actor
    )
    res.json(order)
  } catch (err) { next(err) }
}

export async function cancelOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = (req as any).admin?.email || req.body.actor || 'ADMIN'
    const order = await ordersService.cancelOrder(
      req.params.id as string,
      req.body.reason,
      actor
    )
    res.json(order)
  } catch (err) { next(err) }
}

export async function returnOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = (req as any).admin?.email || req.body.actor || 'ADMIN'
    const order = await ordersService.returnOrder(
      req.params.id as string,
      req.body.reason,
      actor,
      req.body.items
    )
    res.json(order)
  } catch (err) { next(err) }
}

export async function markReturning(req: Request, res: Response, next: NextFunction) {
  try {
    const actor = (req as any).admin?.email || req.body.actor || 'ADMIN'
    const order = await ordersService.markOrderReturning(req.params.id as string, req.body.reason, actor)
    res.json(order)
  } catch (err) { next(err) }
}
