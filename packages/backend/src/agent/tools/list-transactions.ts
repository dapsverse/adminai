import { db } from '../../db'
import { transactions } from '../../db/schema'
import { eq, and, desc, gte, lte } from 'drizzle-orm'
import type { Tool, ToolResult } from './types'

export const listTransactionsTool: Tool = {
  name: 'list_transactions',
  description: 'Tampilkan riwayat transaksi dengan filter opsional berdasarkan jenis, rentang tanggal, atau jumlah yang ditampilkan.',
  parameters: {
    type: 'OBJECT',
    properties: {
      type: {
        type: 'STRING',
        enum: ['income', 'expense'],
        description: 'Filter hanya pemasukan atau hanya pengeluaran',
      },
      limit: {
        type: 'NUMBER',
        description: 'Jumlah transaksi yang ditampilkan (max 50, default 10)',
      },
      from: {
        type: 'STRING',
        description: 'Tanggal mulai filter, format ISO 8601',
      },
      to: {
        type: 'STRING',
        description: 'Tanggal akhir filter, format ISO 8601',
      },
    },
  },

  async execute(args, userId): Promise<ToolResult> {
    try {
      const limit = Math.min(Number(args.limit ?? 10), 50)

      const rows = await db
        .select()
        .from(transactions)
        .where(and(
          eq(transactions.userId, userId),
          args.type ? eq(transactions.type, args.type as 'income' | 'expense') : undefined,
          args.from ? gte(transactions.date, new Date(args.from as string)) : undefined,
          args.to ? lte(transactions.date, new Date(args.to as string)) : undefined,
        ))
        .orderBy(desc(transactions.date))
        .limit(limit)

      return { success: true, data: rows }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}
