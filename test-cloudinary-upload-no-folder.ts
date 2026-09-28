import 'dotenv/config'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const buffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')

const uploadStream = cloudinary.uploader.upload_stream(
  { resource_type: 'image' },
  (error, result) => {
    if (error) {
      console.error("Upload error no folder:", error)
    } else {
      console.log("Upload success no folder:", result?.secure_url)
    }
  }
)
uploadStream.end(buffer)
