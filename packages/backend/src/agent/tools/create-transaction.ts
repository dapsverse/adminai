import { db } from '../../db'
import { transactions } from '../../db/schema'
import type { Tool, ToolResult } from './types'

export const createTransactionTool: Tool = {
  name: 'create_transaction',
  description: 'Catat pemasukan atau pengeluaran baru untuk bisnis. Gunakan saat user menyebut uang masuk, penjualan, biaya, atau pengeluaran.',
  parameters: {
    type: 'OBJECT',
    properties: {
      type: {
        type: 'STRING',
        enum: ['income', 'expense'],
        description: 'income = pemasukan, expense = pengeluaran',
      },
      amount: {
        type: 'NUMBER',
        description: 'Jumlah dalam Rupiah (IDR), bilangan bulat',
      },
      category: {
        type: 'STRING',
        description: 'Kategori opsional, misal: Penjualan, Gaji, Bahan Baku, Transport',
      },
      description: {
        type: 'STRING',
        description: 'Deskripsi singkat transaksi',
      },
      date: {
        type: 'STRING',
        description: 'Tanggal transaksi ISO 8601, misal 2026-06-11. Kosongkan untuk gunakan waktu sekarang.',
      },
    },
    required: ['type', 'amount'],
  },

  async execute(args, userId): Promise<ToolResult> {
    const type = args.type as string | undefined
    const amount = args.amount as number | undefined

    if (!type || (type !== 'income' && type !== 'expense')) {
      return { success: false, error: 'type harus income atau expense' }
    }
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return { success: false, error: 'amount harus diisi (angka dalam Rupiah)' }
    }

    try {
      const [tx] = await db.insert(transactions).values({
        userId,
        type,
        amount: Math.round(Number(amount)),
        category: args.category as string | undefined,
        description: args.description as string | undefined,
        source: 'agent',
        date: args.date ? new Date(args.date as string) : new Date(),
      }).returning()

      return { success: true, data: tx }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}
