import { describe, it, expect, beforeEach, vi } from 'vitest'
import { app } from '../src/index'
import { db } from '../src/db'
import { users } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { signJwt } from '../src/lib/jwt'
import { setTelegramClient } from '../src/lib/telegram'
import { setLlmProvider } from '../src/lib/llm'
import { cleanDb, createTestUser } from './setup'
import type { TelegramClient } from '../src/lib/telegram'
import type { LlmProvider } from '../src/lib/llm/types'

const mockLlm: LlmProvider = {
  async chat() {
    return { content: 'Mock LLM reply', toolCalls: [] }
  },
}

function makeMockBot(): TelegramClient {
  return {
    getMe: vi.fn().mockResolvedValue({ id: 123456789, username: 'mytestbot', firstName: 'My Test Bot' }),
    setWebhook: vi.fn().mockResolvedValue(undefined),
    deleteWebhook: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  }
}

let mockBot: TelegramClient

beforeEach(async () => {
  await cleanDb()
  mockBot = makeMockBot()
  setTelegramClient(mockBot)
  setLlmProvider(mockLlm)
})

async function createUserAndToken() {
  const user = await createTestUser()
  const token = await signJwt({ userId: user.id, email: user.email })
  return { user, token }
}

describe('PUT /auth/telegram', () => {
  it('returns 401 without auth token', async () => {
    const res = await app.request('/auth/telegram', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: 'bot123:ABC', telegramChatId: '987654321' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when botToken is missing', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/auth/telegram', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramChatId: '987654321' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when telegramChatId is missing', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/auth/telegram', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: 'bot123:ABC' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 422 when Telegram rejects the bot token', async () => {
    mockBot.getMe = vi.fn().mockRejectedValue(new Error('Unauthorized'))
    const { token } = await createUserAndToken()
    const res = await app.request('/auth/telegram', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: 'invalid:TOKEN', telegramChatId: '987654321' }),
    })
    expect(res.status).toBe(422)
  })

  it('stores bot token and chat id, calls getMe and setWebhook, returns connected status', async () => {
    const { token, user } = await createUserAndToken()
    const res = await app.request('/auth/telegram', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: 'bot123:ABC', telegramChatId: '987654321' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { telegramConnected: boolean; botUsername: string }
    expect(body.telegramConnected).toBe(true)
    expect(body.botUsername).toBe('mytestbot')
    expect(mockBot.getMe).toHaveBeenCalledWith('bot123:ABC')
    expect(mockBot.setWebhook).toHaveBeenCalledOnce()
    const [updated] = await db.select().from(users).where(eq(users.id, user.id))
    expect(updated.telegramBotToken).toBe('bot123:ABC')
    expect(updated.telegramUserId).toBe('987654321')
  })
})

describe('DELETE /auth/telegram', () => {
  it('returns 401 without auth token', async () => {
    const res = await app.request('/auth/telegram', { method: 'DELETE' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when telegram is not connected', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/auth/telegram', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(400)
  })

  it('calls deleteWebhook, clears telegram fields, returns disconnected status', async () => {
    const { token, user } = await createUserAndToken()
    await db.update(users)
      .set({ telegramBotToken: 'bot123:ABC', telegramUserId: '987654321' })
      .where(eq(users.id, user.id))

    const res = await app.request('/auth/telegram', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { telegramConnected: boolean }
    expect(body.telegramConnected).toBe(false)
    expect(mockBot.deleteWebhook).toHaveBeenCalledWith('bot123:ABC')
    const [updated] = await db.select().from(users).where(eq(users.id, user.id))
    expect(updated.telegramBotToken).toBeNull()
    expect(updated.telegramUserId).toBeNull()
  })
})
