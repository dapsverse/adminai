import { db } from '../../db'
import { transactions } from '../../db/schema'
import { eq, and, gte, sum } from 'drizzle-orm'
import type { Tool, ToolResult } from './types'

async function sumByType(
  userId: string,
  type: 'income' | 'expense',
  since?: Date
): Promise<number> {
  const [row] = await db
    .select({ total: sum(transactions.amount) })
    .from(transactions)
    .where(and(
      eq(transactions.userId, userId),
      eq(transactions.type, type),
      since ? gte(transactions.date, since) : undefined,
    ))
  return Number(row?.total ?? 0)
}

export const getBalanceTool: Tool = {
  name: 'get_balance',
  description: 'Tampilkan ringkasan saldo dan arus kas bisnis. Mencakup total sepanjang waktu dan ringkasan bulan ini.',
  parameters: {
    type: 'OBJECT',
    properties: {},
  },

  async execute(_args, userId): Promise<ToolResult> {
    try {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const [allIncome, allExpense, monthIncome, monthExpense] = await Promise.all([
        sumByType(userId, 'income'),
        sumByType(userId, 'expense'),
        sumByType(userId, 'income', startOfMonth),
        sumByType(userId, 'expense', startOfMonth),
      ])

      return {
        success: true,
        data: {
          allTime: {
            income: allIncome,
            expense: allExpense,
            balance: allIncome - allExpense,
          },
          thisMonth: {
            income: monthIncome,
            expense: monthExpense,
            balance: monthIncome - monthExpense,
          },
          currency: 'IDR',
        },
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}
