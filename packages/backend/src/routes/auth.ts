import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from '../db/schema'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { signJwt } from '../lib/jwt'
import { authMiddleware } from '../middleware/auth'

export const authRouter = new Hono()

function toSafeUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    businessName: user.businessName,
    invoiceSenderName: user.invoiceSenderName,
    emailPollIntervalMinutes: user.emailPollIntervalMinutes,
    onboardingState: user.onboardingState,
    tier: user.tier,
    createdAt: user.createdAt,
  }
}

authRouter.post('/register', async (c) => {
  const body = await c.req.json()
  const { password, fullName, businessName } = body
  const email = body.email?.toLowerCase().trim()

  if (!email || !password || !fullName || !businessName) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Invalid email format' }, 400)
  }

  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const passwordHash = await hashPassword(password)

  let user
  try {
    ;[user] = await db.insert(users).values({ email, passwordHash, fullName, businessName }).returning()
  } catch (err: any) {
    if (err.code === '23505') {
      return c.json({ error: 'Email already registered' }, 409)
    }
    throw err
  }

  const token = await signJwt({ userId: user.id, email: user.email })
  return c.json({ token, user: toSafeUser(user) }, 201)
})

authRouter.post('/login', async (c) => {
  const body = await c.req.json()
  const email = body.email?.toLowerCase().trim()
  const { password } = body
  if (!email || !password) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await signJwt({ userId: user.id, email: user.email })
  return c.json({ token, user: toSafeUser(user) }, 200)
})

authRouter.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ error: 'Not found' }, 404)
  return c.json(toSafeUser(user))
})
