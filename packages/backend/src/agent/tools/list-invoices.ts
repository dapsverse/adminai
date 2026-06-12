import { db } from '../../db'
import { invoices } from '../../db/schema'
import { eq, and, desc } from 'drizzle-orm'
import type { Tool, ToolResult } from './types'

export const listInvoicesTool: Tool = {
  name: 'list_invoices',
  description: 'Tampilkan daftar invoice dengan filter opsional berdasarkan status atau arah (outgoing/incoming).',
  parameters: {
    type: 'OBJECT',
    properties: {
      status: {
        type: 'STRING',
        enum: ['draft', 'sent', 'paid', 'overdue', 'received'],
        description: 'Filter berdasarkan status invoice',
      },
      direction: {
        type: 'STRING',
        enum: ['outgoing', 'incoming'],
        description: 'Filter outgoing (tagihan ke client) atau incoming (tagihan dari supplier)',
      },
      limit: {
        type: 'NUMBER',
        description: 'Jumlah invoice yang ditampilkan (max 50, default 10)',
      },
    },
  },

  async execute(args, userId): Promise<ToolResult> {
    try {
      const limit = Math.min(Number(args.limit ?? 10), 50)

      const rows = await db
        .select()
        .from(invoices)
        .where(and(
          eq(invoices.userId, userId),
          args.status ? eq(invoices.status, args.status as any) : undefined,
          args.direction ? eq(invoices.direction, args.direction as 'outgoing' | 'incoming') : undefined,
        ))
        .orderBy(desc(invoices.createdAt))
        .limit(limit)

      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}
