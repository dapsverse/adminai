import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { processMessage } from '../agent/engine'

export const chatRouter = new Hono()

chatRouter.post('/', authMiddleware, async (c) => {
  let body: { message?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const { message } = body

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return c.json({ error: 'Message is required' }, 400)
  }

  const userId = c.get('userId')
  const reply = await processMessage(userId, message.trim())

  return c.json({ reply })
})
