import { v2 as cloudinary } from 'cloudinary'

cloudinary.config({
  cloud_name: 'dobcklmv2',
  api_key: '363297697163855',
  api_secret: 'wrong_secret',
})

cloudinary.api.ping()
  .then(res => console.log("Ping with wrong secret:", res))
  .catch(err => console.error("Ping with wrong secret error:", err))
