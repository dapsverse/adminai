import cron from 'node-cron'
import { db } from '../db'
import { scheduledReports, users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { generateReport } from './report-generator'
import { getTelegramClient } from './telegram'

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
  const now = new Date()
  const candidate = new Date(now)
  candidate.setHours(hour, minute, 0, 0)

  if (type === 'daily') {
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1)
    return candidate
  }

  if (type === 'weekly') {
    const currentDay = candidate.getDay()
    const targetDay = 1 // Monday
    let daysUntil = (targetDay - currentDay + 7) % 7
    if (daysUntil === 0 && candidate <= now) daysUntil = 7
    candidate.setDate(candidate.getDate() + daysUntil)
    return candidate
  }

  // monthly — first of next month (or this month if 1st hasn't passed)
  candidate.setDate(1)
  if (candidate <= now) {
    candidate.setMonth(candidate.getMonth() + 1)
    candidate.setDate(1)
    candidate.setHours(hour, minute, 0, 0)
  }
  return candidate
}

export function parseTime(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) return null
  const hour = parseInt(match[1], 10)
  const minute = parseInt(match[2], 10)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

export function createReportTask(
  reportId: string,
  userId: string,
  type: 'daily' | 'weekly' | 'monthly'
): () => Promise<void> {
  return async () => {
    const [user] = await db
      .select({ telegramBotToken: users.telegramBotToken, telegramUserId: users.telegramUserId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user?.telegramBotToken || !user?.telegramUserId) return

    const report = await generateReport(userId, type, new Date())

    try {
      await getTelegramClient().sendMessage(user.telegramBotToken, user.telegramUserId, report)
    } catch (err) {
      console.error(`[report-scheduler] userId=${userId} send failed:`, err)
    }

    await db
      .update(scheduledReports)
      .set({ lastRunAt: new Date() })
      .where(eq(scheduledReports.id, reportId))
  }
}

export async function initScheduler(): Promise<void> {
  const reports = await db
    .select({
      id: scheduledReports.id,
      userId: scheduledReports.userId,
      type: scheduledReports.type,
      cronExpression: scheduledReports.cronExpression,
    })
    .from(scheduledReports)

  const s = getReportScheduler()
  for (const report of reports) {
    const task = createReportTask(report.id, report.userId, report.type as 'daily' | 'weekly' | 'monthly')
    s.schedule(report.id, report.cronExpression, task)
  }

  console.log(`[report-scheduler] Initialized ${reports.length} report(s)`)
}
