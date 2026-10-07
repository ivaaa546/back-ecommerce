import { v2 as cloudinary } from 'cloudinary'
import { AppError } from './errors'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

/**
 * Sube un archivo a Cloudinary y retorna la URL pública (T-016).
 */
export async function uploadImage(fileBuffer: Buffer, folder = 'ecommerce', preserveAspect = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { 
        folder, 
        resource_type: 'image',
        transformation: preserveAspect ? undefined : [
          // Fuerza proporción 1:1, fondo blanco para espacios sobrantes, 1080x1080
          { width: 1080, height: 1080, crop: 'pad', background: 'white' },
          // Optimización automática de peso y formato (WebP/AVIF)
          { fetch_format: 'auto', quality: 'auto' }
        ]
      },
      (error, result) => {
        if (error || !result) {
          console.error('[Cloudinary upload failed]:', error?.message)
          reject(AppError.externalService('Error al procesar la imagen con el servicio de almacenamiento'))
          return
        }
        resolve(result.secure_url)
      }
    )
    uploadStream.end(fileBuffer)
  })
}

export default cloudinary
