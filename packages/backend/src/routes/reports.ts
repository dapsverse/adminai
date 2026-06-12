import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db } from '../db'
import { scheduledReports, users } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import {
  getReportScheduler,
  buildCronExpression,
  calculateNextRun,
  createReportTask,
  parseTime,
} from '../lib/report-scheduler'

export const reportsRouter = new Hono()

reportsRouter.get('/reports', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const reports = await db
    .select()
    .from(scheduledReports)
    .where(eq(scheduledReports.userId, userId))
  return c.json({ reports })
})

reportsRouter.post('/reports', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json() as Record<string, unknown>
  const { type, delivery, time = '08:00' } = body

  if (!type || !['daily', 'weekly', 'monthly'].includes(type as string)) {
    return c.json({ error: 'type harus salah satu dari: daily, weekly, monthly' }, 400)
  }
  if (!delivery || !['telegram', 'email', 'both'].includes(delivery as string)) {
    return c.json({ error: 'delivery harus salah satu dari: telegram, email, both' }, 400)
  }

  const parsed = parseTime(time as string)
  if (!parsed) {
    return c.json({ error: 'format time tidak valid, gunakan HH:MM (contoh: 08:00)' }, 400)
  }

  if (delivery === 'telegram' || delivery === 'both') {
    const [user] = await db
      .select({ telegramBotToken: users.telegramBotToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user?.telegramBotToken) {
      return c.json({ error: 'Telegram belum terhubung. Hubungkan Telegram di Pengaturan terlebih dahulu.' }, 400)
    }
  }

  const reportType = type as 'daily' | 'weekly' | 'monthly'
  const cronExpression = buildCronExpression(reportType, parsed.hour, parsed.minute)
  const nextRunAt = calculateNextRun(reportType, parsed.hour, parsed.minute)

  const [report] = await db
    .insert(scheduledReports)
    .values({
      userId,
      type: reportType,
      cronExpression,
      delivery: delivery as 'telegram' | 'email' | 'both',
      nextRunAt,
    })
    .returning()

  const task = createReportTask(report.id, userId, reportType)
  getReportScheduler().schedule(report.id, cronExpression, task)

  return c.json(report, 201)
})

reportsRouter.delete('/reports/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const reportId = c.req.param('id')

  const [report] = await db
    .select()
    .from(scheduledReports)
    .where(and(eq(scheduledReports.id, reportId), eq(scheduledReports.userId, userId)))
    .limit(1)

  if (!report) {
    return c.json({ error: 'Laporan tidak ditemukan' }, 404)
  }

  getReportScheduler().unschedule(reportId)
  await db.delete(scheduledReports).where(eq(scheduledReports.id, reportId))

  return c.json({ deleted: true })
})
