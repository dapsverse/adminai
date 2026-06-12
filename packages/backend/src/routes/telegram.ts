import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { getTelegramClient } from '../lib/telegram'

export const telegramRouter = new Hono()

telegramRouter.put('/auth/telegram', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json() as Record<string, unknown>
  const { botToken, telegramChatId } = body

  if (!botToken || typeof botToken !== 'string') {
    return c.json({ error: 'botToken harus diisi' }, 400)
  }
  if (!telegramChatId || typeof telegramChatId !== 'string') {
    return c.json({ error: 'telegramChatId harus diisi' }, 400)
  }

  const telegram = getTelegramClient()
  let botInfo: { username: string }
  try {
    botInfo = await telegram.getMe(botToken)
  } catch {
    return c.json({ error: 'Bot token tidak valid. Periksa kembali token dari BotFather.' }, 422)
  }

  const base = process.env.WEBHOOK_BASE_URL ?? ''
  try {
    await telegram.setWebhook(botToken, `${base}/telegram/webhook/${userId}`)
  } catch {
    return c.json({ error: 'Gagal mendaftarkan webhook ke Telegram.' }, 422)
  }

  await db.update(users)
    .set({ telegramBotToken: botToken, telegramUserId: telegramChatId })
    .where(eq(users.id, userId))

  return c.json({ telegramConnected: true, botUsername: botInfo.username })
})

telegramRouter.delete('/auth/telegram', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const [user] = await db
    .select({ telegramBotToken: users.telegramBotToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user?.telegramBotToken) {
    return c.json({ error: 'Telegram belum terhubung' }, 400)
  }

  const telegram = getTelegramClient()
  try {
    await telegram.deleteWebhook(user.telegramBotToken)
  } catch {
    // Ignore — still clear local data even if Telegram API call fails
  }

  await db.update(users)
    .set({ telegramBotToken: null, telegramUserId: null })
    .where(eq(users.id, userId))

  return c.json({ telegramConnected: false })
})
