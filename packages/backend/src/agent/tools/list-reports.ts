import { db } from '../../db'
import { scheduledReports } from '../../db/schema'
import { eq } from 'drizzle-orm'
import type { Tool, ToolResult } from './types'

export const listReportsTool: Tool = {
  name: 'list_reports',
  description: 'Tampilkan semua laporan keuangan yang sudah dijadwalkan untuk user ini.',
  parameters: {
    type: 'OBJECT',
    properties: {},
  },

  async execute(_args, userId): Promise<ToolResult> {
    const reports = await db
      .select()
      .from(scheduledReports)
      .where(eq(scheduledReports.userId, userId))

    return {
      success: true,
      data: reports.map(r => ({
        id: r.id,
        type: r.type,
        delivery: r.delivery,
        cronExpression: r.cronExpression,
        nextRunAt: r.nextRunAt?.toISOString() ?? null,
        lastRunAt: r.lastRunAt?.toISOString() ?? null,
      })),
    }
  },
}
