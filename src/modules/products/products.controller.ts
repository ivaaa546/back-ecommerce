import { Request, Response, NextFunction } from 'express'
import * as productsService from './products.service'

export async function listActive(req: Request, res: Response, next: NextFunction) {
  try {
    const { category, search, ids } = req.query
    const idsArray = typeof ids === 'string' ? ids.split(',').map((id) => id.trim()).filter(Boolean) : undefined
    const products = await productsService.listActive({
      categorySlug: category as string | undefined,
      search: search as string | undefined,
      ids: idsArray,
    })
    res.json(products)
  } catch (err) { next(err) }
}

export async function getBySlug(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.getBySlug(req.params.slug as string)
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
    const product = await productsService.update(req.params.id as string, req.body)
    res.json(product)
  } catch (err) { next(err) }
}

export async function toggleStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.toggleStatus(req.params.id as string)
    res.json(product)
  } catch (err) { next(err) }
}

export async function updateStock(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.updateStock(req.params.id as string, req.body.stock)
    res.json(product)
  } catch (err) { next(err) }
}

export async function toggleFeatured(req: Request, res: Response, next: NextFunction) {
  try {
    const product = await productsService.toggleFeatured(req.params.id as string)
    res.json(product)
  } catch (err) { next(err) }
}

export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await productsService.remove(req.params.id as string)
    res.status(204).send()
  } catch (err) { next(err) }
}

// Endpoints de variantes (T-008, RF-001)
export async function listVariants(req: Request, res: Response, next: NextFunction) {
  try {
    const variants = await productsService.listVariants(req.params.id as string)
    res.json(variants)
  } catch (err) { next(err) }
}

export async function createVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const variant = await productsService.createVariant(req.params.id as string, req.body)
    res.status(201).json(variant)
  } catch (err) { next(err) }
}

export async function updateVariant(req: Request, res: Response, next: NextFunction) {
  try {
    const variant = await productsService.updateVariant(
      req.params.id as string,
      req.params.variantId as string,
      req.body
    )
    res.json(variant)
  } catch (err) { next(err) }
}

export async function deleteVariant(req: Request, res: Response, next: NextFunction) {
  try {
    await productsService.deleteVariant(
      req.params.id as string,
      req.params.variantId as string
    )
    res.status(204).send()
  } catch (err) { next(err) }
}
