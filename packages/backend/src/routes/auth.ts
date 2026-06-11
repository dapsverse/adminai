import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from '../db/schema'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { signJwt } from '../lib/jwt'
import { authMiddleware } from '../middleware/auth'

export const authRouter = new Hono()

authRouter.post('/register', async (c) => {
  const body = await c.req.json()
  const { email, password, fullName, businessName } = body

  if (!email || !password || !fullName || !businessName) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) {
    return c.json({ error: 'Email already registered' }, 409)
  }

  const passwordHash = await hashPassword(password)
  const [user] = await db.insert(users).values({ email, passwordHash, fullName, businessName }).returning()

  const token = await signJwt({ userId: user.id, email: user.email })
  const { passwordHash: _, ...safeUser } = user

  return c.json({ token, user: safeUser }, 201)
})

authRouter.post('/login', async (c) => {
  const { email, password } = await c.req.json()

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await signJwt({ userId: user.id, email: user.email })
  const { passwordHash: _, ...safeUser } = user

  return c.json({ token, user: safeUser }, 200)
})

authRouter.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ error: 'Not found' }, 404)
  const { passwordHash: _, ...safeUser } = user
  return c.json(safeUser)
})
