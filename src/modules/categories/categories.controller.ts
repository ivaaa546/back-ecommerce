import { Request, Response, NextFunction } from 'express'
import * as categoriesService from './categories.service'

// GET /api/categories — público
export async function listActive(req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await categoriesService.listActive()
    res.json(categories)
  } catch (err) { next(err) }
}

// GET /api/admin/categories — admin
export async function listAll(req: Request, res: Response, next: NextFunction) {
  try {
    const categories = await categoriesService.listAll()
    res.json(categories)
  } catch (err) { next(err) }
}

// POST /api/admin/categories
export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await categoriesService.create(req.body)
    res.status(201).json(category)
  } catch (err) { next(err) }
}

// PUT /api/admin/categories/:id
export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await categoriesService.update(req.params.id, req.body)
    res.json(category)
  } catch (err) { next(err) }
}

// PATCH /api/admin/categories/:id/status
export async function toggleStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const category = await categoriesService.toggleStatus(req.params.id)
    res.json(category)
  } catch (err) { next(err) }
}

// DELETE /api/admin/categories/:id
export async function remove(req: Request, res: Response, next: NextFunction) {
  try {
    await categoriesService.remove(req.params.id)
    res.status(204).send()
  } catch (err) { next(err) }
}
