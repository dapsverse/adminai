import { db } from '../../db'
import { scheduledReports } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import { getReportScheduler } from '../../lib/report-scheduler'
import type { Tool, ToolResult } from './types'

export const deleteReportTool: Tool = {
  name: 'delete_report',
  description: 'Hapus jadwal laporan otomatis berdasarkan ID. Gunakan list_reports untuk mendapatkan ID laporan.',
  parameters: {
    type: 'OBJECT',
    properties: {
      reportId: {
        type: 'STRING',
        description: 'ID laporan yang akan dihapus',
      },
    },
    required: ['reportId'],
  },

  async execute(args, userId): Promise<ToolResult> {
    const reportId = args.reportId as string

    try {
      const [report] = await db
        .select()
        .from(scheduledReports)
        .where(and(eq(scheduledReports.id, reportId), eq(scheduledReports.userId, userId)))
        .limit(1)

      if (!report) {
        return { success: false, error: `Laporan dengan ID "${reportId}" tidak ditemukan.` }
      }

      getReportScheduler().unschedule(reportId)
      await db.delete(scheduledReports).where(eq(scheduledReports.id, reportId))

      const typeLabel: Record<string, string> = {
        daily: 'harian',
        weekly: 'mingguan',
        monthly: 'bulanan',
      }

      return {
        success: true,
        data: { deleted: true, message: `Laporan ${typeLabel[report.type] ?? report.type} berhasil dihapus.` },
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}
