import { prisma } from '../../lib/prisma'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { AppError } from '../../lib/errors'

export async function login(email: string, password: string) {
  const admin = await prisma.admin.findUnique({ where: { email } })

  if (!admin) {
    throw AppError.unauthorized('Credenciales inválidas')
  }

  const valid = await bcrypt.compare(password, admin.passwordHash)

  if (!valid) {
    throw AppError.unauthorized('Credenciales inválidas')
  }

  const secret = process.env.JWT_SECRET!
  const token = jwt.sign({ id: admin.id, email: admin.email }, secret, { expiresIn: '7d' })

  return { token, admin: { id: admin.id, email: admin.email } }
}
