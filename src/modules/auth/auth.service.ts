import { prisma } from '../../lib/prisma'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

export async function login(email: string, password: string) {
  const admin = await prisma.admin.findUnique({ where: { email } })

  if (!admin) {
    const error = new Error('Credenciales inválidas') as Error & { statusCode: number }
    error.statusCode = 401
    throw error
  }

  const valid = await bcrypt.compare(password, admin.passwordHash)

  if (!valid) {
    const error = new Error('Credenciales inválidas') as Error & { statusCode: number }
    error.statusCode = 401
    throw error
  }

  const secret = process.env.JWT_SECRET!
  const token = jwt.sign({ id: admin.id, email: admin.email }, secret, { expiresIn: '7d' })

  return { token, admin: { id: admin.id, email: admin.email } }
}
