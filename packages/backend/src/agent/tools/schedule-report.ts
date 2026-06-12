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
import { isEmailConfigured } from '../../lib/email'
import type { Tool, ToolResult } from './types'

export const scheduleReportTool: Tool = {
  name: 'schedule_report',
  description: 'Jadwalkan laporan keuangan otomatis. Mendukung laporan harian (setiap hari), mingguan (setiap Senin), atau bulanan (setiap tanggal 1). Bisa dikirim via Telegram, Email, atau keduanya.',
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
      delivery: {
        type: 'STRING',
        enum: ['telegram', 'email', 'both'],
        description: 'Metode pengiriman: telegram (default), email, atau both (Telegram & Email bersamaan).',
      },
    },
    required: ['type'],
  },

  async execute(args, userId): Promise<ToolResult> {
    const type = args.type as 'daily' | 'weekly' | 'monthly'
    const timeStr = (args.time as string | undefined) ?? '08:00'
    const delivery = (args.delivery as string | undefined) ?? 'telegram'

    const parsed = parseTime(timeStr)
    if (!parsed) {
      return { success: false, error: `Format jam tidak valid: "${timeStr}". Gunakan format HH:MM, contoh: 08:00` }
    }

    if (!['telegram', 'email', 'both'].includes(delivery)) {
      return { success: false, error: `Delivery tidak valid: "${delivery}". Pilihan: telegram, email, both` }
    }

    if ((delivery === 'email' || delivery === 'both') && !isEmailConfigured()) {
      return { success: false, error: 'Email belum dikonfigurasi di server AdminAI.' }
    }

    try {
      if (delivery === 'telegram' || delivery === 'both') {
        const [user] = await db
          .select({ telegramBotToken: users.telegramBotToken })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
        if (!user?.telegramBotToken) {
          return { success: false, error: 'Telegram belum terhubung. Hubungkan Telegram di halaman Pengaturan terlebih dahulu.' }
        }
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
          delivery: delivery as 'telegram' | 'email' | 'both',
          nextRunAt,
        })
        .returning()

      const task = createReportTask(report.id, userId, type, delivery as 'telegram' | 'email' | 'both')
      getReportScheduler().schedule(report.id, cronExpression, task)

      const typeLabel: Record<string, string> = {
        daily: 'harian (setiap hari)',
        weekly: 'mingguan (setiap Senin)',
        monthly: 'bulanan (setiap tanggal 1)',
      }
      const deliveryLabel: Record<string, string> = {
        telegram: 'Telegram',
        email: 'Email',
        both: 'Telegram & Email',
      }

      return {
        success: true,
        data: {
          id: report.id,
          type,
          delivery,
          cronExpression,
          nextRunAt: nextRunAt.toISOString(),
          message: `Laporan ${typeLabel[type]} jam ${timeStr} berhasil dijadwalkan via ${deliveryLabel[delivery]}.`,
        },
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}
