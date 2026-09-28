import { Request, Response, NextFunction } from 'express'
import * as productsService from './products.service'

export async function listActive(req: Request, res: Response, next: NextFunction) {
  try {
    const { category, search } = req.query
    const products = await productsService.listActive({
      categorySlug: category as string | undefined,
      search: search as string | undefined,
    })
    res.json(products)
  } catch (err) { next(err) }
}

export async function getBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.getBySlug(req.params.slug)
    res.json(product)
  } catch (err) { next(err) }
}

export async function listAll(req: Request, res: Response, next: NextFunction) {
  try {
    const products = await productsService.listAll()
    res.json(products)
  } catch (err) { next(err) }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.create(req.body)
    res.status(201).json(product)
  } catch (err) { next(err) }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.update(req.params.id, req.body)
    res.json(product)
  } catch (err) { next(err) }
}

export async function toggleStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.toggleStatus(req.params.id)
    res.json(product)
  } catch (err) { next(err) }
}

export async function updateStock(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.updateStock(req.params.id, req.body.stock)
    res.json(product)
  } catch (err) { next(err) }
}

export async function toggleFeatured(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.toggleFeatured(req.params.id)
    res.json(product)
  } catch (err) { next(err) }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await productsService.remove(req.params.id)
    res.status(204).send()
  } catch (err) { next(err) }
}
