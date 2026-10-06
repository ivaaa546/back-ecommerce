import { Request, Response, NextFunction } from 'express'
import { uploadImage } from '../../lib/cloudinary'

export async function upload(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) {
      res.status(400).json({ message: 'No se recibió ningún archivo' })
      return
    }
    const isLogo = req.body.kind === 'logo'
    const url = await uploadImage(req.file.buffer, isLogo ? 'ecommerce/logos' : 'ecommerce', isLogo)
    res.json({ url })
  } catch (err) { next(err) }
}
