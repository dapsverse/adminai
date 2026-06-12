import { describe, it, expect, beforeEach } from 'vitest'
import { app } from '../src/index'
import { db } from '../src/db'
import { users, scheduledReports } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { signJwt } from '../src/lib/jwt'
import { setReportScheduler, initScheduler } from '../src/lib/report-scheduler'
import { setTelegramClient } from '../src/lib/telegram'
import { cleanDb, createTestUser } from './setup'
import type { ReportScheduler } from '../src/lib/report-scheduler'
import type { TelegramClient } from '../src/lib/telegram'

class MockReportScheduler implements ReportScheduler {
  readonly scheduled = new Map<string, { cron: string; task: () => Promise<void> }>()

  schedule(reportId: string, cronExpression: string, task: () => Promise<void>): void {
    this.scheduled.set(reportId, { cron: cronExpression, task })
  }

  unschedule(reportId: string): void {
    this.scheduled.delete(reportId)
  }
}

function makeMockBot(): TelegramClient {
  return {
    getMe: async () => ({ id: 1, username: 'bot', firstName: 'Bot' }),
    setWebhook: async () => {},
    deleteWebhook: async () => {},
    sendMessage: async () => {},
  }
}

let mockScheduler: MockReportScheduler
let mockBot: TelegramClient

beforeEach(async () => {
  await cleanDb()
  mockScheduler = new MockReportScheduler()
  setReportScheduler(mockScheduler)
  mockBot = makeMockBot()
  setTelegramClient(mockBot)
})

async function createUserAndToken(overrides?: { businessName?: string }) {
  const user = await createTestUser(overrides)
  const token = await signJwt({ userId: user.id, email: user.email })
  return { user, token }
}

async function connectTelegram(userId: string) {
  await db.update(users)
    .set({ telegramBotToken: 'bot123:ABC', telegramUserId: '987654321' })
    .where(eq(users.id, userId))
}

describe('POST /reports', () => {
  it('returns 401 without auth token', async () => {
    const res = await app.request('/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when type is missing', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ delivery: 'telegram', time: '08:00' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when time format is invalid', async () => {
    const { token, user } = await createUserAndToken()
    await connectTelegram(user.id)
    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '25:99' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when telegram not connected but delivery is telegram', async () => {
    const { token } = await createUserAndToken()
    // user has no telegram token
    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })
    expect(res.status).toBe(400)
  })

  it('creates a daily report, stores correct cron expression, and schedules the task', async () => {
    const { token, user } = await createUserAndToken()
    await connectTelegram(user.id)

    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as { id: string; type: string; cronExpression: string; nextRunAt: string }
    expect(body.type).toBe('daily')
    expect(body.cronExpression).toBe('0 8 * * *')
    expect(body.nextRunAt).toBeDefined()
    expect(mockScheduler.scheduled.size).toBe(1)
    expect([...mockScheduler.scheduled.values()][0].cron).toBe('0 8 * * *')
  })

  it('creates a weekly report with Monday cron expression', async () => {
    const { token, user } = await createUserAndToken()
    await connectTelegram(user.id)

    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'weekly', delivery: 'telegram', time: '07:30' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as { cronExpression: string }
    expect(body.cronExpression).toBe('30 7 * * 1')
  })

  it('creates a monthly report with 1st-of-month cron expression', async () => {
    const { token, user } = await createUserAndToken()
    await connectTelegram(user.id)

    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'monthly', delivery: 'telegram', time: '09:00' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as { cronExpression: string }
    expect(body.cronExpression).toBe('0 9 1 * *')
  })

  it('returns 409 when a schedule of the same type already exists', async () => {
    const { token, user } = await createUserAndToken()
    await connectTelegram(user.id)

    // Create first report
    await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })

    // Try to create duplicate
    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '09:00' }),
    })
    expect(res.status).toBe(409)
  })

  it('task sends Telegram message when triggered', async () => {
    const { token, user } = await createUserAndToken({ businessName: 'Toko Uji' })
    await connectTelegram(user.id)

    await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })

    let sendArgs: [string, string, string] | undefined
    mockBot.sendMessage = async (token, chatId, text) => { sendArgs = [token, chatId, text] }

    const [entry] = [...mockScheduler.scheduled.values()]
    await entry.task()

    expect(sendArgs).toBeDefined()
    expect(sendArgs![0]).toBe('bot123:ABC')
    expect(sendArgs![1]).toBe('987654321')
    expect(sendArgs![2]).toContain('Laporan Harian')
    expect(sendArgs![2]).toContain('Toko Uji')
  })
})

describe('GET /reports', () => {
  it('returns 401 without auth token', async () => {
    const res = await app.request('/reports')
    expect(res.status).toBe(401)
  })

  it('returns empty array when no reports exist', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/reports', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { reports: unknown[] }
    expect(body.reports).toEqual([])
  })

  it('returns only reports belonging to the requesting user', async () => {
    const { token: token1, user: user1 } = await createUserAndToken()
    const { user: user2 } = await createUserAndToken()
    await connectTelegram(user1.id)
    await connectTelegram(user2.id)

    // Create report for user1
    await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })

    // Insert a report directly for user2
    await db.insert(scheduledReports).values({
      userId: user2.id,
      type: 'weekly',
      cronExpression: '0 8 * * 1',
      delivery: 'telegram',
    })

    const res = await app.request('/reports', {
      headers: { Authorization: `Bearer ${token1}` },
    })
    const body = await res.json() as { reports: Array<{ type: string }> }
    expect(body.reports).toHaveLength(1)
    expect(body.reports[0].type).toBe('daily')
  })
})

describe('DELETE /reports/:id', () => {
  it('returns 401 without auth token', async () => {
    const res = await app.request('/reports/some-id', { method: 'DELETE' })
    expect(res.status).toBe(401)
  })

  it('returns 404 for a non-existent report', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/reports/nonexistent', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 when report belongs to another user', async () => {
    const { token: token1 } = await createUserAndToken()
    const { user: user2 } = await createUserAndToken()
    await connectTelegram(user2.id)

    await db.insert(scheduledReports).values({
      userId: user2.id,
      type: 'daily',
      cronExpression: '0 8 * * *',
      delivery: 'telegram',
    })
    const [report] = await db.select({ id: scheduledReports.id }).from(scheduledReports).where(eq(scheduledReports.userId, user2.id)).limit(1)

    const res = await app.request(`/reports/${report.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token1}` },
    })
    expect(res.status).toBe(404)
  })

  it('deletes the report from DB and unschedules it', async () => {
    const { token, user } = await createUserAndToken()
    await connectTelegram(user.id)

    const createRes = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })
    const { id } = await createRes.json() as { id: string }

    expect(mockScheduler.scheduled.size).toBe(1)

    const deleteRes = await app.request(`/reports/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(deleteRes.status).toBe(200)
    expect(mockScheduler.scheduled.size).toBe(0)

    const remaining = await db.select().from(scheduledReports).where(eq(scheduledReports.id, id))
    expect(remaining).toHaveLength(0)
  })
})

describe('initScheduler', () => {
  it('re-registers all existing reports on startup', async () => {
    const user = await createTestUser()
    await connectTelegram(user.id)

    const inserted = await db.insert(scheduledReports).values([
      { userId: user.id, type: 'daily', cronExpression: '0 8 * * *', delivery: 'telegram' },
      { userId: user.id, type: 'weekly', cronExpression: '0 8 * * 1', delivery: 'telegram' },
    ]).returning()

    await initScheduler()

    expect(mockScheduler.scheduled.size).toBe(2)
    const scheduledIds = [...mockScheduler.scheduled.keys()]
    expect(scheduledIds).toContain(inserted[0].id)
    expect(scheduledIds).toContain(inserted[1].id)
  })
})
