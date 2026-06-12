import { db } from '../db'
import { transactions, users } from '../db/schema'
import { eq, and, gte, lte, desc, sum } from 'drizzle-orm'

function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID')}`
}

function getPeriodBounds(type: 'daily' | 'weekly' | 'monthly', date: Date): {
  from: Date
  to: Date
  label: string
} {
  const d = new Date(date)

  if (type === 'daily') {
    const from = new Date(d)
    from.setHours(0, 0, 0, 0)
    const to = new Date(d)
    to.setHours(23, 59, 59, 999)
    const label = d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    return { from, to, label }
  }

  if (type === 'weekly') {
    const day = d.getDay()
    const daysToMonday = day === 0 ? -6 : 1 - day
    const monday = new Date(d)
    monday.setDate(d.getDate() + daysToMonday)
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23, 59, 59, 999)
    const monLabel = monday.toLocaleDateString('id-ID', { day: 'numeric', month: 'long' })
    const sunLabel = sunday.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    return { from: monday, to: sunday, label: `${monLabel} – ${sunLabel}` }
  }

  // monthly
  const from = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)
  const label = d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })
  return { from, to, label }
}

const HEADER: Record<string, string> = {
  daily: 'Laporan Harian',
  weekly: 'Laporan Mingguan',
  monthly: 'Laporan Bulanan',
}

export async function generateReport(
  userId: string,
  type: 'daily' | 'weekly' | 'monthly',
  date: Date
): Promise<string> {
  const { from, to, label } = getPeriodBounds(type, date)

  const [user] = await db
    .select({ businessName: users.businessName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  const businessName = user?.businessName ?? ''

  const [incomeRow] = await db
    .select({ total: sum(transactions.amount) })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.type, 'income'), gte(transactions.date, from), lte(transactions.date, to)))

  const [expenseRow] = await db
    .select({ total: sum(transactions.amount) })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), eq(transactions.type, 'expense'), gte(transactions.date, from), lte(transactions.date, to)))

  const income = Number(incomeRow?.total ?? 0)
  const expense = Number(expenseRow?.total ?? 0)
  const net = income - expense

  const txList = await db
    .select({ type: transactions.type, amount: transactions.amount, description: transactions.description })
    .from(transactions)
    .where(and(eq(transactions.userId, userId), gte(transactions.date, from), lte(transactions.date, to)))
    .orderBy(desc(transactions.date))
    .limit(5)

  const netStr = net >= 0 ? `+${formatRupiah(net)}` : `-${formatRupiah(Math.abs(net))}`

  const lines: string[] = [
    `📊 ${HEADER[type]} — ${label}`,
    '',
    `Bisnis: ${businessName}`,
    '',
    '💰 Ringkasan:',
    `• Pemasukan: ${formatRupiah(income)}`,
    `• Pengeluaran: ${formatRupiah(expense)}`,
    `• Net: ${netStr}`,
  ]

  if (txList.length > 0) {
    lines.push('')
    lines.push(`📋 Transaksi (${txList.length}):`)
    for (const tx of txList) {
      const sign = tx.type === 'income' ? '✅ +' : '🔴 -'
      const desc = tx.description ? ` — ${tx.description}` : ''
      lines.push(`• ${sign}${formatRupiah(tx.amount)}${desc}`)
    }
  }

  lines.push('')
  lines.push('—')
  lines.push('AdminAI')

  return lines.join('\n')
}
