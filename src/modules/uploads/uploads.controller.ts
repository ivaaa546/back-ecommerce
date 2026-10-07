import { Request, Response, NextFunction } from 'express'
import { uploadImage } from '../../lib/cloudinary'
import { AppError } from '../../lib/errors'

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      throw AppError.badRequest('No se recibió ningún archivo')
    }
    const isLogo = req.body.kind === 'logo'
    const url = await uploadImage(req.file.buffer, isLogo ? 'ecommerce/logos' : 'ecommerce', isLogo)
    res.json({ url })
  } catch (err) { next(err) }
}
