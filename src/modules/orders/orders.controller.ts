import { Request, Response, NextFunction } from 'express'
import * as ordersService from './orders.service'
import { OrderStatus } from '../../types/domain'

export async function createOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const { customer, address, items, paymentMethod } = req.body
    if (!customer?.fullName || !customer?.phone || !address?.department || !items?.length) {
      res.status(400).json({ message: 'Datos del pedido incompletos' })
      return
    }
    const order = await ordersService.createOrder({ customer, address, items, paymentMethod })
    res.status(201).json({
      orderId: order.id,
      orderNumber: order.orderNumber,
      total: order.total,
      shippingCost: order.shippingCost,
      status: order.status,
    })
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
    const order = await ordersService.getById(req.params.id)
    res.json(order)
  } catch (err) { next(err) }
}

export async function advanceStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const order = await ordersService.advanceStatus(req.params.id, req.body.status)
    res.json(order)
  } catch (err) { next(err) }
}
