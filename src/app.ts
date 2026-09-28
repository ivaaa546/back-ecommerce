import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { errorMiddleware } from './middlewares/error.middleware'

// Módulos — rutas públicas
import { authRouter } from './modules/auth/auth.routes'
import { categoriesRouter } from './modules/categories/categories.routes'
import { productsRouter } from './modules/products/products.routes'
import { ordersRouter } from './modules/orders/orders.routes'
import { settingsRouter } from './modules/settings/settings.routes'

// Módulos — rutas admin
import { categoriesAdminRouter } from './modules/categories/categories.routes'
import { productsAdminRouter } from './modules/products/products.routes'
import { ordersAdminRouter } from './modules/orders/orders.routes'
import { settingsAdminRouter } from './modules/settings/settings.routes'
import { uploadsRouter } from './modules/uploads/uploads.routes'

const app = express()

app.use(cors())
app.use(express.json())

// Health check (T-005)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Rutas públicas
app.use('/api/auth', authRouter)
app.use('/api/categories', categoriesRouter)
app.use('/api/products', productsRouter)
app.use('/api/orders', ordersRouter)
app.use('/api/settings', settingsRouter)

// Rutas admin (protegidas por JWT dentro de cada router)
app.use('/api/admin/categories', categoriesAdminRouter)
app.use('/api/admin/products', productsAdminRouter)
app.use('/api/admin/orders', ordersAdminRouter)
app.use('/api/admin/settings', settingsAdminRouter)
app.use('/api/admin/uploads', uploadsRouter)

// Error handler centralizado (debe ir al final)
app.use(errorMiddleware)

export default app
