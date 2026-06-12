import cron from 'node-cron'
import { db } from '../db'
import { scheduledReports, users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { generateReport } from './report-generator'
import { getTelegramClient } from './telegram'
import { getEmailClient } from './email'

export interface ReportScheduler {
  schedule(reportId: string, cronExpression: string, task: () => Promise<void>): void
  unschedule(reportId: string): void
}

class NodeCronScheduler implements ReportScheduler {
  private tasks = new Map<string, ReturnType<typeof cron.schedule>>()

  schedule(reportId: string, cronExpression: string, task: () => Promise<void>): void {
    this.tasks.get(reportId)?.stop()
    const t = cron.schedule(cronExpression, task, { scheduled: true, timezone: 'Asia/Jakarta' })
    this.tasks.set(reportId, t)
  }

  unschedule(reportId: string): void {
    this.tasks.get(reportId)?.stop()
    this.tasks.delete(reportId)
  }
}

let scheduler: ReportScheduler = new NodeCronScheduler()

export function setReportScheduler(s: ReportScheduler): void {
  scheduler = s
}

export function getReportScheduler(): ReportScheduler {
  return scheduler
}

export function buildCronExpression(
  type: 'daily' | 'weekly' | 'monthly',
  hour: number,
  minute: number
): string {
  if (type === 'daily') return `${minute} ${hour} * * *`
  if (type === 'weekly') return `${minute} ${hour} * * 1`
  return `${minute} ${hour} 1 * *`
}

export function calculateNextRun(
  type: 'daily' | 'weekly' | 'monthly',
  hour: number,
  minute: number
): Date {
  const JAKARTA_OFFSET_MS = 7 * 60 * 60 * 1000
  // Interpret current time in WIB (UTC+7) using UTC arithmetic
  const nowWib = new Date(Date.now() + JAKARTA_OFFSET_MS)
  const candidate = new Date(nowWib)
  candidate.setUTCHours(hour, minute, 0, 0)

  if (type === 'daily') {
    if (candidate <= nowWib) candidate.setUTCDate(candidate.getUTCDate() + 1)
    return new Date(candidate.getTime() - JAKARTA_OFFSET_MS)
  }

  if (type === 'weekly') {
    const currentDay = nowWib.getUTCDay()
    const targetDay = 1 // Monday
    let daysUntil = (targetDay - currentDay + 7) % 7
    if (daysUntil === 0 && candidate <= nowWib) daysUntil = 7
    candidate.setUTCDate(candidate.getUTCDate() + daysUntil)
    return new Date(candidate.getTime() - JAKARTA_OFFSET_MS)
  }

  // monthly — 1st of next month (or this month if 1st hasn't passed yet in WIB)
  candidate.setUTCDate(1)
  if (candidate <= nowWib) {
    candidate.setUTCMonth(candidate.getUTCMonth() + 1)
    candidate.setUTCDate(1)
    candidate.setUTCHours(hour, minute, 0, 0)
  }
  return new Date(candidate.getTime() - JAKARTA_OFFSET_MS)
}

export function parseTime(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) return null
  const hour = parseInt(match[1], 10)
  const minute = parseInt(match[2], 10)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

function buildEmailSubject(type: 'daily' | 'weekly' | 'monthly'): string {
  const labels: Record<string, string> = {
    daily: 'Laporan Harian',
    weekly: 'Laporan Mingguan',
    monthly: 'Laporan Bulanan',
  }
  return `[AdminAI] ${labels[type]}`
}

export function createReportTask(
  reportId: string,
  userId: string,
  type: 'daily' | 'weekly' | 'monthly',
  delivery: 'telegram' | 'email' | 'both' = 'telegram'
): () => Promise<void> {
  return async () => {
    try {
      const [user] = await db
        .select({
          email: users.email,
          telegramBotToken: users.telegramBotToken,
          telegramUserId: users.telegramUserId,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      if (!user) return

      const report = await generateReport(userId, type, new Date())

      const sends: Promise<void>[] = []

      if ((delivery === 'telegram' || delivery === 'both') && user.telegramBotToken && user.telegramUserId) {
        sends.push(
          getTelegramClient()
            .sendMessage(user.telegramBotToken, user.telegramUserId, report)
            .catch(err => console.error(`[report-scheduler] telegram send failed reportId=${reportId}:`, err))
        )
      }

      if (delivery === 'email' || delivery === 'both') {
        sends.push(
          getEmailClient()
            .sendEmail(user.email, buildEmailSubject(type), report)
            .catch(err => console.error(`[report-scheduler] email send failed reportId=${reportId}:`, err))
        )
      }

      await Promise.all(sends)

      await db
        .update(scheduledReports)
        .set({ lastRunAt: new Date() })
        .where(eq(scheduledReports.id, reportId))
    } catch (err) {
      console.error(`[report-scheduler] reportId=${reportId} userId=${userId} send failed:`, err)
    }
  }
}

const validTypes = ['daily', 'weekly', 'monthly'] as const
type ValidType = typeof validTypes[number]

export async function initScheduler(): Promise<void> {
  const reports = await db
    .select({
      id: scheduledReports.id,
      userId: scheduledReports.userId,
      type: scheduledReports.type,
      cronExpression: scheduledReports.cronExpression,
      delivery: scheduledReports.delivery,
    })
    .from(scheduledReports)

  const s = getReportScheduler()
  for (const report of reports) {
    if (!validTypes.includes(report.type as ValidType)) {
      console.warn(`[report-scheduler] Unknown report type "${report.type}", skipping reportId=${report.id}`)
      continue
    }
    try {
      const task = createReportTask(
        report.id,
        report.userId,
        report.type as ValidType,
        report.delivery as 'telegram' | 'email' | 'both'
      )
      s.schedule(report.id, report.cronExpression, task)
    } catch (err) {
      console.error(`[report-scheduler] Failed to schedule reportId=${report.id}:`, err)
    }
  }

  console.log(`[report-scheduler] Initialized ${reports.length} report(s)`)
}
