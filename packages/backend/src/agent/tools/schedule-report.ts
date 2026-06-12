import { db } from '../../db'
import { scheduledReports, users } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import {
  getReportScheduler,
  buildCronExpression,
  calculateNextRun,
  createReportTask,
  parseTime,
} from '../../lib/report-scheduler'
import type { Tool, ToolResult } from './types'

export const scheduleReportTool: Tool = {
  name: 'schedule_report',
  description: 'Jadwalkan laporan keuangan otomatis yang dikirim via Telegram. Mendukung laporan harian (setiap hari), mingguan (setiap Senin), atau bulanan (setiap tanggal 1).',
  parameters: {
    type: 'OBJECT',
    properties: {
      type: {
        type: 'STRING',
        enum: ['daily', 'weekly', 'monthly'],
        description: 'Frekuensi laporan: daily (setiap hari), weekly (setiap Senin), monthly (setiap tanggal 1)',
      },
      time: {
        type: 'STRING',
        description: 'Jam pengiriman format HH:MM, contoh: 08:00. Default: 08:00 jika tidak disebutkan.',
      },
    },
    required: ['type'],
  },

  async execute(args, userId): Promise<ToolResult> {
    const type = args.type as 'daily' | 'weekly' | 'monthly'
    const timeStr = (args.time as string | undefined) ?? '08:00'

    const parsed = parseTime(timeStr)
    if (!parsed) {
      return { success: false, error: `Format jam tidak valid: "${timeStr}". Gunakan format HH:MM, contoh: 08:00` }
    }

    const [user] = await db
      .select({ telegramBotToken: users.telegramBotToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user?.telegramBotToken) {
      return { success: false, error: 'Telegram belum terhubung. Minta user untuk menghubungkan Telegram di halaman Pengaturan.' }
    }

    const [existing] = await db
      .select({ id: scheduledReports.id })
      .from(scheduledReports)
      .where(and(eq(scheduledReports.userId, userId), eq(scheduledReports.type, type)))
      .limit(1)

    if (existing) {
      return {
        success: false,
        error: `Laporan ${type} sudah terjadwal (ID: ${existing.id}). Gunakan delete_report untuk menghapusnya terlebih dahulu sebelum membuat jadwal baru.`,
      }
    }

    const cronExpression = buildCronExpression(type, parsed.hour, parsed.minute)
    const nextRunAt = calculateNextRun(type, parsed.hour, parsed.minute)

    const [report] = await db
      .insert(scheduledReports)
      .values({
        userId,
        type,
        cronExpression,
        delivery: 'telegram',
        nextRunAt,
      })
      .returning()

    const task = createReportTask(report.id, userId, type)
    getReportScheduler().schedule(report.id, cronExpression, task)

    const typeLabel: Record<string, string> = {
      daily: 'harian (setiap hari)',
      weekly: 'mingguan (setiap Senin)',
      monthly: 'bulanan (setiap tanggal 1)',
    }

    return {
      success: true,
      data: {
        id: report.id,
        type,
        cronExpression,
        nextRunAt: nextRunAt.toISOString(),
        message: `Laporan ${typeLabel[type]} jam ${timeStr} berhasil dijadwalkan via Telegram.`,
      },
    }
  },
}
