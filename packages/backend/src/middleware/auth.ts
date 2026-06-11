import { createMiddleware } from 'hono/factory'
import { verifyJwt } from '../lib/jwt'

export const authMiddleware = createMiddleware<{
  Variables: { userId: string; email: string }
}>(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  try {
    const payload = await verifyJwt(header.slice(7))
    c.set('userId', payload.userId)
    c.set('email', payload.email)
    await next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
})
