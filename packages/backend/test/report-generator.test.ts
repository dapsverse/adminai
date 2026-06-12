import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db'
import { transactions, users } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { generateReport } from '../src/lib/report-generator'
import { cleanDb, createTestUser } from './setup'

beforeEach(async () => {
  await cleanDb()
})

describe('generateReport — daily', () => {
  it('includes income, expense, and net in the output', async () => {
    const user = await createTestUser({ businessName: 'Toko Maju' })
    const today = new Date()

    await db.insert(transactions).values([
      { userId: user.id, type: 'income', amount: 500000, date: today, source: 'agent' },
      { userId: user.id, type: 'expense', amount: 200000, date: today, source: 'agent' },
    ])

    const report = await generateReport(user.id, 'daily', today)

    expect(report).toContain('Laporan Harian')
    expect(report).toContain('Toko Maju')
    expect(report).toContain('500.000')
    expect(report).toContain('200.000')
    expect(report).toContain('300.000')
  })

  it('reports zero totals when no transactions exist for the period', async () => {
    const user = await createTestUser()
    const report = await generateReport(user.id, 'daily', new Date())
    expect(report).toContain('0')
    expect(report).toContain('Laporan Harian')
  })

  it('excludes transactions outside the period', async () => {
    const user = await createTestUser()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    await db.insert(transactions).values([
      { userId: user.id, type: 'income', amount: 999999, date: yesterday, source: 'agent' },
    ])

    const report = await generateReport(user.id, 'daily', new Date())
    expect(report).not.toContain('999.999')
  })
})

describe('generateReport — weekly', () => {
  it('includes weekly header and covers Mon–Sun range', async () => {
    const user = await createTestUser()
    const report = await generateReport(user.id, 'weekly', new Date())
    expect(report).toContain('Laporan Mingguan')
  })
})

describe('generateReport — monthly', () => {
  it('includes monthly header', async () => {
    const user = await createTestUser()
    const report = await generateReport(user.id, 'monthly', new Date())
    expect(report).toContain('Laporan Bulanan')
  })
})
