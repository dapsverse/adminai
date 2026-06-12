import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db'
import { transactions } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { cleanDb, createTestUser } from './setup'
import { createTransactionTool } from '../src/agent/tools/create-transaction'

beforeEach(() => cleanDb())

describe('create_transaction', () => {
  it('records an income transaction', async () => {
    const user = await createTestUser()
    const result = await createTransactionTool.execute(
      { type: 'income', amount: 500000, description: 'Penjualan kopi' },
      user.id
    )
    expect(result.success).toBe(true)
    const tx = result.data as any
    expect(tx.type).toBe('income')
    expect(tx.amount).toBe(500000)
    expect(tx.source).toBe('agent')
  })

  it('records an expense transaction with category', async () => {
    const user = await createTestUser()
    const result = await createTransactionTool.execute(
      { type: 'expense', amount: 150000, category: 'Bahan Baku', description: 'Beli tepung' },
      user.id
    )
    expect(result.success).toBe(true)
    const tx = result.data as any
    expect(tx.type).toBe('expense')
    expect(tx.category).toBe('Bahan Baku')
  })

  it('returns error when type is missing', async () => {
    const user = await createTestUser()
    const result = await createTransactionTool.execute({ amount: 100000 }, user.id)
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns error when amount is missing', async () => {
    const user = await createTestUser()
    const result = await createTransactionTool.execute({ type: 'income' }, user.id)
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('persists transaction to database', async () => {
    const user = await createTestUser()
    await createTransactionTool.execute(
      { type: 'income', amount: 200000 },
      user.id
    )
    const rows = await db.select().from(transactions).where(eq(transactions.userId, user.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBe(200000)
  })

  it('returns error when amount is zero', async () => {
    const user = await createTestUser()
    const result = await createTransactionTool.execute({ type: 'income', amount: 0 }, user.id)
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('returns error when date format is invalid', async () => {
    const user = await createTestUser()
    const result = await createTransactionTool.execute(
      { type: 'income', amount: 100000, date: 'bukan-tanggal' },
      user.id
    )
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
