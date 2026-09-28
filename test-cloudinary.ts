import 'dotenv/config'
import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

cloudinary.api.ping()
  .then(res => console.log("Cloudinary ping success:", res))
  .catch(err => console.error("Cloudinary ping error:", err))
