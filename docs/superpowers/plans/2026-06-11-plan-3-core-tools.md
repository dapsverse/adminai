# AdminAI Core Business Tools — Implementation Plan (Plan 3 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 6 core business tools (keuangan + invoice), register them in the agent, fix the auth security exposure, and load chat history on page refresh — making the chatbox genuinely useful for UMKM.

**Architecture:** Each tool is a focused module implementing the `Tool` interface (`agent/tools/types.ts`). All tools are registered once at startup via `agent/tools/register.ts` which is called in `src/index.ts`. The engine's system prompt is extended to list available tools. Auth responses switch to an explicit allowlist (removes accidental exposure of OAuth tokens). Chat history loads on page mount via `GET /chat/history`.

**Tech Stack:** Drizzle ORM (sum, count, and, eq, gte, lte, desc), existing Tool/ToolResult interfaces, React `useEffect` for history loading.

---

## File Structure (new/modified files only)

```
packages/backend/src/agent/tools/
  create-transaction.ts     — NEW: record income/expense
  get-balance.ts            — NEW: all-time + this-month balance summary
  list-transactions.ts      — NEW: transaction history with optional filters
  create-invoice.ts         — NEW: create outgoing/incoming invoice
  list-invoices.ts          — NEW: list invoices with optional filters
  mark-invoice-paid.ts      — NEW: mark invoice as paid

packages/backend/src/agent/
  tools/register.ts         — NEW: registers all 6 tools at startup
  engine.ts                 — MODIFY: update system prompt + fix tool exception handling

packages/backend/src/routes/
  auth.ts                   — MODIFY: replace spread with explicit safe-field allowlist
  chat.ts                   — MODIFY: add GET /chat/history handler

packages/backend/src/index.ts    — MODIFY: call registerTools() at startup

packages/backend/test/
  setup.ts                  — MODIFY: add createTestUser() shared helper
  tools-keuangan.test.ts    — NEW: integration tests for keuangan tools
  tools-invoice.test.ts     — NEW: integration tests for invoice tools
  chat.test.ts              — MODIFY: add test for GET /chat/history

packages/frontend/src/hooks/
  useChat.ts                — MODIFY: load history on mount via GET /chat/history
```

---

## Task 1: Fix auth response allowlist + add createTestUser helper

**Files:**
- Modify: `packages/backend/src/routes/auth.ts`
- Modify: `packages/backend/test/setup.ts`

**Problem:** `routes/auth.ts` uses `{ passwordHash: _, ...safeUser }` spread, which exposes `telegramBotToken`, `telegramUserId`, `emailOauthToken`. Fix by using an explicit helper.

- [ ] **Step 1: Add `toSafeUser` helper and update all three handlers in `packages/backend/src/routes/auth.ts`**

Replace the file with:

```typescript
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from '../db/schema'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { signJwt } from '../lib/jwt'
import { authMiddleware } from '../middleware/auth'

export const authRouter = new Hono()

function toSafeUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    businessName: user.businessName,
    invoiceSenderName: user.invoiceSenderName,
    emailPollIntervalMinutes: user.emailPollIntervalMinutes,
    onboardingState: user.onboardingState,
    tier: user.tier,
    createdAt: user.createdAt,
  }
}

authRouter.post('/register', async (c) => {
  const body = await c.req.json()
  const { password, fullName, businessName } = body
  const email = body.email?.toLowerCase().trim()

  if (!email || !password || !fullName || !businessName) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'Invalid email format' }, 400)
  }

  if (password.length < 8) {
    return c.json({ error: 'Password must be at least 8 characters' }, 400)
  }

  const passwordHash = await hashPassword(password)

  let user
  try {
    ;[user] = await db.insert(users).values({ email, passwordHash, fullName, businessName }).returning()
  } catch (err: any) {
    if (err.code === '23505') {
      return c.json({ error: 'Email already registered' }, 409)
    }
    throw err
  }

  const token = await signJwt({ userId: user.id, email: user.email })
  return c.json({ token, user: toSafeUser(user) }, 201)
})

authRouter.post('/login', async (c) => {
  const body = await c.req.json()
  const email = body.email?.toLowerCase().trim()
  const { password } = body
  if (!email || !password) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await signJwt({ userId: user.id, email: user.email })
  return c.json({ token, user: toSafeUser(user) }, 200)
})

authRouter.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ error: 'Not found' }, 404)
  return c.json(toSafeUser(user))
})
```

- [ ] **Step 2: Add `createTestUser` to `packages/backend/test/setup.ts`**

```typescript
import 'dotenv/config'
import { db } from '../src/db'
import {
  toolUsageLog, customTools, scheduledReports,
  conversationMessages, invoices, transactions, users,
} from '../src/db/schema'
import { createId } from '@paralleldrive/cuid2'

export async function cleanDb() {
  await db.delete(toolUsageLog)
  await db.delete(customTools)
  await db.delete(scheduledReports)
  await db.delete(conversationMessages)
  await db.delete(invoices)
  await db.delete(transactions)
  await db.delete(users)
}

export async function createTestUser(overrides?: {
  fullName?: string
  businessName?: string
}) {
  const [user] = await db.insert(users).values({
    email: `${createId()}@test.com`,
    passwordHash: 'hash',
    fullName: overrides?.fullName ?? 'Test User',
    businessName: overrides?.businessName ?? 'Toko Test',
  }).returning()
  return user
}
```

- [ ] **Step 3: Run tests — all 26 should still pass**

```
pnpm test
```

Expected: `Tests 26 passed (26)`

- [ ] **Step 4: Commit**

```
git add packages/backend/src/routes/auth.ts packages/backend/test/setup.ts
git commit -m "fix: use explicit safe-field allowlist in auth responses, add createTestUser helper"
```

---

## Task 2: `create_transaction` tool + tests

**Files:**
- Create: `packages/backend/src/agent/tools/create-transaction.ts`
- Create: `packages/backend/test/tools-keuangan.test.ts` (partial — will grow through Tasks 3 and 4)

**Schema reference:** `transactions` table: `id, userId, type ('income'|'expense'), amount (bigint number, IDR), currency, category?, description?, source ('manual'|'email_parsed'|'agent'), date (timestamp), createdAt`

- [ ] **Step 1: Write failing test — create `packages/backend/test/tools-keuangan.test.ts`**

```typescript
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
})
```

- [ ] **Step 2: Run test — verify it fails**

```
pnpm test test/tools-keuangan.test.ts
```

Expected: FAIL — `Cannot find module '../src/agent/tools/create-transaction'`

- [ ] **Step 3: Create `packages/backend/src/agent/tools/create-transaction.ts`**

```typescript
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
```

- [ ] **Step 4: Run test — verify it passes**

```
pnpm test test/tools-keuangan.test.ts
```

Expected: `Tests 5 passed (5)` (plus existing tests)

- [ ] **Step 5: Commit**

```
git add packages/backend/src/agent/tools/create-transaction.ts packages/backend/test/tools-keuangan.test.ts
git commit -m "feat: add create_transaction tool"
```

---

## Task 3: `get_balance` tool + tests

**Files:**
- Create: `packages/backend/src/agent/tools/get-balance.ts`
- Modify: `packages/backend/test/tools-keuangan.test.ts` (append tests)

Returns two summaries: all-time totals and this month's totals, so the agent can answer both "berapa saldo saya" and "bulan ini pemasukan berapa".

- [ ] **Step 1: Append failing tests to `packages/backend/test/tools-keuangan.test.ts`**

Add these imports at the top of the file (after existing imports):

```typescript
import { getBalanceTool } from '../src/agent/tools/get-balance'
```

Append this describe block at the bottom of the file:

```typescript
describe('get_balance', () => {
  it('returns zeros for a new user with no transactions', async () => {
    const user = await createTestUser()
    const result = await getBalanceTool.execute({}, user.id)
    expect(result.success).toBe(true)
    const data = result.data as any
    expect(data.allTime.income).toBe(0)
    expect(data.allTime.expense).toBe(0)
    expect(data.allTime.balance).toBe(0)
    expect(data.currency).toBe('IDR')
  })

  it('calculates correct all-time balance', async () => {
    const user = await createTestUser()
    await createTransactionTool.execute({ type: 'income', amount: 1000000 }, user.id)
    await createTransactionTool.execute({ type: 'income', amount: 500000 }, user.id)
    await createTransactionTool.execute({ type: 'expense', amount: 300000 }, user.id)

    const result = await getBalanceTool.execute({}, user.id)
    const data = result.data as any
    expect(data.allTime.income).toBe(1500000)
    expect(data.allTime.expense).toBe(300000)
    expect(data.allTime.balance).toBe(1200000)
  })

  it('this month summary only includes current month transactions', async () => {
    const user = await createTestUser()
    // Past transaction (3 months ago)
    const pastDate = new Date()
    pastDate.setMonth(pastDate.getMonth() - 3)
    await createTransactionTool.execute(
      { type: 'income', amount: 999999, date: pastDate.toISOString() },
      user.id
    )
    // This month
    await createTransactionTool.execute({ type: 'income', amount: 200000 }, user.id)

    const result = await getBalanceTool.execute({}, user.id)
    const data = result.data as any
    expect(data.allTime.income).toBe(1199999)
    expect(data.thisMonth.income).toBe(200000)
  })
})
```

- [ ] **Step 2: Run test — verify new tests fail**

```
pnpm test test/tools-keuangan.test.ts
```

Expected: new `get_balance` tests fail, create_transaction tests still pass

- [ ] **Step 3: Create `packages/backend/src/agent/tools/get-balance.ts`**

```typescript
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
```

- [ ] **Step 4: Run test — verify all pass**

```
pnpm test test/tools-keuangan.test.ts
```

Expected: all keuangan tests pass

- [ ] **Step 5: Commit**

```
git add packages/backend/src/agent/tools/get-balance.ts packages/backend/test/tools-keuangan.test.ts
git commit -m "feat: add get_balance tool"
```

---

## Task 4: `list_transactions` tool + tests

**Files:**
- Create: `packages/backend/src/agent/tools/list-transactions.ts`
- Modify: `packages/backend/test/tools-keuangan.test.ts` (append tests)

- [ ] **Step 1: Add import and failing tests to `packages/backend/test/tools-keuangan.test.ts`**

Add to imports:
```typescript
import { listTransactionsTool } from '../src/agent/tools/list-transactions'
```

Append to file:

```typescript
describe('list_transactions', () => {
  it('returns empty array for new user', async () => {
    const user = await createTestUser()
    const result = await listTransactionsTool.execute({}, user.id)
    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('returns transactions in descending date order', async () => {
    const user = await createTestUser()
    const older = new Date('2026-01-01')
    const newer = new Date('2026-06-01')
    await createTransactionTool.execute({ type: 'income', amount: 100, date: older.toISOString() }, user.id)
    await createTransactionTool.execute({ type: 'expense', amount: 200, date: newer.toISOString() }, user.id)

    const result = await listTransactionsTool.execute({}, user.id)
    const rows = result.data as any[]
    expect(rows[0].amount).toBe(200) // newest first
    expect(rows[1].amount).toBe(100)
  })

  it('filters by type', async () => {
    const user = await createTestUser()
    await createTransactionTool.execute({ type: 'income', amount: 100 }, user.id)
    await createTransactionTool.execute({ type: 'expense', amount: 200 }, user.id)

    const result = await listTransactionsTool.execute({ type: 'income' }, user.id)
    const rows = result.data as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].type).toBe('income')
  })

  it('respects limit', async () => {
    const user = await createTestUser()
    for (let i = 0; i < 5; i++) {
      await createTransactionTool.execute({ type: 'income', amount: 100 * (i + 1) }, user.id)
    }
    const result = await listTransactionsTool.execute({ limit: 3 }, user.id)
    expect((result.data as any[]).length).toBe(3)
  })
})
```

- [ ] **Step 2: Run test — verify new tests fail**

- [ ] **Step 3: Create `packages/backend/src/agent/tools/list-transactions.ts`**

```typescript
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
```

- [ ] **Step 4: Run test — all keuangan tests pass**

```
pnpm test test/tools-keuangan.test.ts
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```
git add packages/backend/src/agent/tools/list-transactions.ts packages/backend/test/tools-keuangan.test.ts
git commit -m "feat: add list_transactions tool"
```

---

## Task 5: `create_invoice` tool + tests

**Files:**
- Create: `packages/backend/src/agent/tools/create-invoice.ts`
- Create: `packages/backend/test/tools-invoice.test.ts` (partial)

**Schema reference:** `invoices` table: `id, userId, direction ('outgoing'|'incoming'), invoiceNumber, clientName, clientEmail?, items (jsonb array of {description, qty, price}), totalAmount (bigint IDR), status, dueDate?, paidAt?, createdAt`

Invoice number format: `INV-{YYYYMM}-{seq}` e.g. `INV-202606-001`. Sequence = count of user's invoices this month + 1.

Initial status: `outgoing` → `'draft'`, `incoming` → `'received'`.

- [ ] **Step 1: Write failing tests — create `packages/backend/test/tools-invoice.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { cleanDb, createTestUser } from './setup'
import { createInvoiceTool } from '../src/agent/tools/create-invoice'

beforeEach(() => cleanDb())

const sampleItems = [
  { description: 'Jasa desain logo', qty: 1, price: 500000 },
  { description: 'Revisi 2x', qty: 2, price: 100000 },
]

describe('create_invoice', () => {
  it('creates an outgoing invoice with auto-generated number', async () => {
    const user = await createTestUser()
    const result = await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'PT Maju Jaya', items: sampleItems },
      user.id
    )
    expect(result.success).toBe(true)
    const inv = result.data as any
    expect(inv.direction).toBe('outgoing')
    expect(inv.clientName).toBe('PT Maju Jaya')
    expect(inv.status).toBe('draft')
    expect(inv.invoiceNumber).toMatch(/^INV-\d{6}-\d{3}$/)
  })

  it('calculates totalAmount from items', async () => {
    const user = await createTestUser()
    const result = await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client A', items: sampleItems },
      user.id
    )
    const inv = result.data as any
    // 1*500000 + 2*100000 = 700000
    expect(inv.totalAmount).toBe(700000)
  })

  it('creates an incoming invoice with status received', async () => {
    const user = await createTestUser()
    const result = await createInvoiceTool.execute(
      {
        direction: 'incoming',
        clientName: 'Supplier Bahan',
        items: [{ description: 'Tepung 50kg', qty: 1, price: 400000 }],
      },
      user.id
    )
    const inv = result.data as any
    expect(inv.direction).toBe('incoming')
    expect(inv.status).toBe('received')
  })

  it('increments invoice sequence per user per month', async () => {
    const user = await createTestUser()
    const r1 = await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client A', items: [{ description: 'X', qty: 1, price: 100 }] },
      user.id
    )
    const r2 = await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client B', items: [{ description: 'Y', qty: 1, price: 200 }] },
      user.id
    )
    const n1 = (r1.data as any).invoiceNumber
    const n2 = (r2.data as any).invoiceNumber
    expect(n1).not.toBe(n2)
    expect(n1).toMatch(/-001$/)
    expect(n2).toMatch(/-002$/)
  })

  it('returns error when required fields are missing', async () => {
    const user = await createTestUser()
    const result = await createInvoiceTool.execute({ direction: 'outgoing' }, user.id)
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — verify it fails**

```
pnpm test test/tools-invoice.test.ts
```

- [ ] **Step 3: Create `packages/backend/src/agent/tools/create-invoice.ts`**

```typescript
import { db } from '../../db'
import { invoices } from '../../db/schema'
import { eq, and, gte, count } from 'drizzle-orm'
import type { Tool, ToolResult } from './types'

async function nextInvoiceNumber(userId: string): Promise<string> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [row] = await db
    .select({ n: count() })
    .from(invoices)
    .where(and(
      eq(invoices.userId, userId),
      gte(invoices.createdAt, startOfMonth),
    ))

  const seq = String((row?.n ?? 0) + 1).padStart(3, '0')
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  return `INV-${yearMonth}-${seq}`
}

export const createInvoiceTool: Tool = {
  name: 'create_invoice',
  description: 'Buat invoice baru. outgoing = invoice yang kita kirim ke client (tagihan). incoming = tagihan dari supplier yang kita terima.',
  parameters: {
    type: 'OBJECT',
    properties: {
      direction: {
        type: 'STRING',
        enum: ['outgoing', 'incoming'],
        description: 'outgoing: kita tagih client. incoming: supplier tagih kita.',
      },
      clientName: {
        type: 'STRING',
        description: 'Nama client (outgoing) atau nama supplier (incoming)',
      },
      clientEmail: {
        type: 'STRING',
        description: 'Email client atau supplier (opsional)',
      },
      items: {
        type: 'ARRAY',
        description: 'Daftar item atau jasa yang ditagihkan',
        items: {
          type: 'OBJECT',
          properties: {
            description: { type: 'STRING', description: 'Nama item atau jasa' },
            qty: { type: 'NUMBER', description: 'Jumlah unit' },
            price: { type: 'NUMBER', description: 'Harga per unit dalam Rupiah' },
          },
          required: ['description', 'qty', 'price'],
        },
      },
      dueDate: {
        type: 'STRING',
        description: 'Tanggal jatuh tempo (ISO 8601, opsional)',
      },
    },
    required: ['direction', 'clientName', 'items'],
  },

  async execute(args, userId): Promise<ToolResult> {
    const direction = args.direction as string | undefined
    const clientName = args.clientName as string | undefined
    const items = args.items as Array<{ description: string; qty: number; price: number }> | undefined

    if (!direction || (direction !== 'outgoing' && direction !== 'incoming')) {
      return { success: false, error: 'direction harus outgoing atau incoming' }
    }
    if (!clientName) {
      return { success: false, error: 'clientName harus diisi' }
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'items harus berisi minimal 1 item' }
    }

    try {
      const totalAmount = items.reduce((sum, item) => sum + item.qty * item.price, 0)
      const invoiceNumber = await nextInvoiceNumber(userId)
      const status = direction === 'outgoing' ? 'draft' : 'received'

      const [inv] = await db.insert(invoices).values({
        userId,
        direction,
        invoiceNumber,
        clientName,
        clientEmail: args.clientEmail as string | undefined,
        items,
        totalAmount: Math.round(totalAmount),
        status,
        dueDate: args.dueDate ? new Date(args.dueDate as string) : undefined,
      }).returning()

      return { success: true, data: inv }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}
```

- [ ] **Step 4: Run test — all invoice tests pass**

```
pnpm test test/tools-invoice.test.ts
```

- [ ] **Step 5: Commit**

```
git add packages/backend/src/agent/tools/create-invoice.ts packages/backend/test/tools-invoice.test.ts
git commit -m "feat: add create_invoice tool"
```

---

## Task 6: `list_invoices` tool + tests

**Files:**
- Create: `packages/backend/src/agent/tools/list-invoices.ts`
- Modify: `packages/backend/test/tools-invoice.test.ts` (append)

- [ ] **Step 1: Add import and failing tests to `packages/backend/test/tools-invoice.test.ts`**

Add to imports:
```typescript
import { listInvoicesTool } from '../src/agent/tools/list-invoices'
```

Append:

```typescript
describe('list_invoices', () => {
  it('returns empty array for new user', async () => {
    const user = await createTestUser()
    const result = await listInvoicesTool.execute({}, user.id)
    expect(result.success).toBe(true)
    expect(result.data).toEqual([])
  })

  it('returns invoices in descending creation order', async () => {
    const user = await createTestUser()
    await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client A', items: [{ description: 'A', qty: 1, price: 100 }] },
      user.id
    )
    await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client B', items: [{ description: 'B', qty: 1, price: 200 }] },
      user.id
    )
    const result = await listInvoicesTool.execute({}, user.id)
    const rows = result.data as any[]
    expect(rows[0].clientName).toBe('Client B') // newest first
  })

  it('filters by status', async () => {
    const user = await createTestUser()
    await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client A', items: [{ description: 'A', qty: 1, price: 100 }] },
      user.id
    )
    await createInvoiceTool.execute(
      { direction: 'incoming', clientName: 'Supplier X', items: [{ description: 'B', qty: 1, price: 200 }] },
      user.id
    )
    // outgoing = draft, incoming = received
    const result = await listInvoicesTool.execute({ status: 'draft' }, user.id)
    const rows = result.data as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].clientName).toBe('Client A')
  })

  it('filters by direction', async () => {
    const user = await createTestUser()
    await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client A', items: [{ description: 'A', qty: 1, price: 100 }] },
      user.id
    )
    await createInvoiceTool.execute(
      { direction: 'incoming', clientName: 'Supplier X', items: [{ description: 'B', qty: 1, price: 200 }] },
      user.id
    )
    const result = await listInvoicesTool.execute({ direction: 'incoming' }, user.id)
    const rows = result.data as any[]
    expect(rows).toHaveLength(1)
    expect(rows[0].clientName).toBe('Supplier X')
  })
})
```

- [ ] **Step 2: Run test — verify new tests fail**

- [ ] **Step 3: Create `packages/backend/src/agent/tools/list-invoices.ts`**

```typescript
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
```

- [ ] **Step 4: Run test — all invoice tests pass**

- [ ] **Step 5: Commit**

```
git add packages/backend/src/agent/tools/list-invoices.ts packages/backend/test/tools-invoice.test.ts
git commit -m "feat: add list_invoices tool"
```

---

## Task 7: `mark_invoice_paid` tool + tests

**Files:**
- Create: `packages/backend/src/agent/tools/mark-invoice-paid.ts`
- Modify: `packages/backend/test/tools-invoice.test.ts` (append)

- [ ] **Step 1: Add import and failing tests to `packages/backend/test/tools-invoice.test.ts`**

Add to imports:
```typescript
import { markInvoicePaidTool } from '../src/agent/tools/mark-invoice-paid'
```

Append:

```typescript
describe('mark_invoice_paid', () => {
  it('marks an outgoing invoice as paid and sets paidAt', async () => {
    const user = await createTestUser()
    const created = await createInvoiceTool.execute(
      { direction: 'outgoing', clientName: 'Client A', items: [{ description: 'A', qty: 1, price: 100 }] },
      user.id
    )
    const invoiceId = (created.data as any).id

    const result = await markInvoicePaidTool.execute({ invoiceId }, user.id)
    expect(result.success).toBe(true)
    const updated = result.data as any
    expect(updated.status).toBe('paid')
    expect(updated.paidAt).toBeTruthy()
  })

  it('marks an incoming invoice as paid', async () => {
    const user = await createTestUser()
    const created = await createInvoiceTool.execute(
      { direction: 'incoming', clientName: 'Supplier X', items: [{ description: 'B', qty: 1, price: 200 }] },
      user.id
    )
    const invoiceId = (created.data as any).id

    const result = await markInvoicePaidTool.execute({ invoiceId }, user.id)
    expect(result.success).toBe(true)
    expect((result.data as any).status).toBe('paid')
  })

  it('returns error when invoice not found or belongs to another user', async () => {
    const user = await createTestUser()
    const result = await markInvoicePaidTool.execute({ invoiceId: 'nonexistent-id' }, user.id)
    expect(result.success).toBe(false)
    expect(result.error).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — verify new tests fail**

- [ ] **Step 3: Create `packages/backend/src/agent/tools/mark-invoice-paid.ts`**

```typescript
import { db } from '../../db'
import { invoices } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import type { Tool, ToolResult } from './types'

export const markInvoicePaidTool: Tool = {
  name: 'mark_invoice_paid',
  description: 'Tandai invoice sebagai sudah lunas (paid). Gunakan saat client sudah bayar invoice outgoing, atau saat kita sudah bayar tagihan incoming.',
  parameters: {
    type: 'OBJECT',
    properties: {
      invoiceId: {
        type: 'STRING',
        description: 'ID invoice yang sudah lunas',
      },
    },
    required: ['invoiceId'],
  },

  async execute(args, userId): Promise<ToolResult> {
    const invoiceId = args.invoiceId as string | undefined
    if (!invoiceId) {
      return { success: false, error: 'invoiceId harus diisi' }
    }

    try {
      const [updated] = await db
        .update(invoices)
        .set({ status: 'paid', paidAt: new Date() })
        .where(and(
          eq(invoices.id, invoiceId),
          eq(invoices.userId, userId),
        ))
        .returning()

      if (!updated) {
        return { success: false, error: 'Invoice tidak ditemukan' }
      }

      return { success: true, data: updated }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}
```

- [ ] **Step 4: Run test — all invoice tests pass**

```
pnpm test test/tools-invoice.test.ts
```

- [ ] **Step 5: Run full test suite — no regressions**

```
pnpm test
```

Expected: all tests pass (26 existing + keuangan + invoice tests)

- [ ] **Step 6: Commit**

```
git add packages/backend/src/agent/tools/mark-invoice-paid.ts packages/backend/test/tools-invoice.test.ts
git commit -m "feat: add mark_invoice_paid tool"
```

---

## Task 8: Register all tools + update engine

**Files:**
- Create: `packages/backend/src/agent/tools/register.ts`
- Modify: `packages/backend/src/agent/engine.ts`
- Modify: `packages/backend/src/index.ts`

This task wires everything together: registers all 6 tools at startup and tells the LLM what tools are available.

- [ ] **Step 1: Create `packages/backend/src/agent/tools/register.ts`**

```typescript
import { registerTool } from './index'
import { createTransactionTool } from './create-transaction'
import { getBalanceTool } from './get-balance'
import { listTransactionsTool } from './list-transactions'
import { createInvoiceTool } from './create-invoice'
import { listInvoicesTool } from './list-invoices'
import { markInvoicePaidTool } from './mark-invoice-paid'

export function registerTools(): void {
  registerTool(createTransactionTool)
  registerTool(getBalanceTool)
  registerTool(listTransactionsTool)
  registerTool(createInvoiceTool)
  registerTool(listInvoicesTool)
  registerTool(markInvoicePaidTool)
}
```

- [ ] **Step 2: Call `registerTools()` in `packages/backend/src/index.ts`**

```typescript
import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { authRouter } from './routes/auth'
import { chatRouter } from './routes/chat'
import { registerTools } from './agent/tools/register'

registerTools()

export const app = new Hono()

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.route('/auth', authRouter)
app.route('/chat', chatRouter)

app.get('/health', (c) => c.json({ ok: true }))

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT) || 3000
  serve({ fetch: app.fetch, port })
  console.log(`Backend running on http://localhost:${port}`)
}
```

**Note:** `registerTools()` is called at module load, before `export const app`. In tests, `import { app } from '../src/index'` will trigger tool registration automatically, so the engine will have all tools available even in tests.

- [ ] **Step 3: Update system prompt in `packages/backend/src/agent/engine.ts`**

Replace the `buildSystemPrompt` function with:

```typescript
function buildSystemPrompt(fullName: string, businessName: string): string {
  return `Kamu adalah AdminAI, asisten AI untuk usaha kecil.
Pengguna: ${fullName} | Bisnis: ${businessName}

Tugasmu: membantu mengelola keuangan dan invoice ${businessName} melalui percakapan.
Jawab dalam Bahasa Indonesia yang santai dan ramah.

Tools yang tersedia:
- create_transaction: catat pemasukan atau pengeluaran baru
- get_balance: lihat ringkasan saldo dan arus kas (semua waktu + bulan ini)
- list_transactions: tampilkan riwayat transaksi dengan filter opsional
- create_invoice: buat invoice baru (outgoing ke client, atau incoming dari supplier)
- list_invoices: lihat daftar invoice dan statusnya
- mark_invoice_paid: tandai invoice sudah lunas

Panduan penggunaan tools:
- Gunakan tools secara proaktif saat user menyebut transaksi, invoice, atau minta laporan
- Jika informasi kurang lengkap (misal: jumlah uang tidak jelas), tanyakan dulu sebelum memanggil tool
- Semua amount dalam Rupiah (IDR), bilangan bulat
- Setelah berhasil, konfirmasi ke user apa yang sudah dicatat dengan format yang mudah dibaca`.trim()
}
```

Also wrap tool execution in try/catch to prevent exceptions from crashing the response. Replace the tool call block in `processMessage`:

```typescript
    if (response.toolCalls.length > 0) {
      const tc = response.toolCalls[0]
      const tool = getTool(tc.name)

      if (!tool) {
        reply = 'Maaf, fitur tersebut belum tersedia saat ini.'
      } else {
        try {
          const result = await tool.execute(tc.args, userId)
          const historyWithCurrentMessage = [
            ...history,
            { role: 'user' as const, content: message },
          ]
          const followUp = await llm.chat(
            systemPrompt,
            historyWithCurrentMessage,
            `Data dari ${tc.name}: ${JSON.stringify(result.data ?? result.error)}\nBerikan respons informatif kepada pengguna.`
          )
          reply = followUp.content ?? 'Maaf, tidak ada respons.'
        } catch {
          reply = 'Maaf, terjadi kesalahan saat memproses permintaan. Silakan coba lagi.'
        }
      }
    } else {
```

- [ ] **Step 4: Run full test suite — all tests pass**

```
pnpm test
```

Expected: all tests still pass (tools registered but registry is a module singleton — tests that imported `app` before registration may not see tools, but existing tests use mock LLM so tool calls don't happen)

- [ ] **Step 5: Commit**

```
git add packages/backend/src/agent/tools/register.ts packages/backend/src/agent/engine.ts packages/backend/src/index.ts
git commit -m "feat: register all 6 tools at startup, update agent system prompt"
```

---

## Task 9: `GET /chat/history` endpoint + frontend history loading

**Files:**
- Modify: `packages/backend/src/agent/context.ts`
- Modify: `packages/backend/src/routes/chat.ts`
- Modify: `packages/backend/test/chat.test.ts`
- Modify: `packages/frontend/src/hooks/useChat.ts`

When the user refreshes the page, they should see their previous conversation instead of starting fresh.

- [ ] **Step 1: Add `loadHistory` function to `packages/backend/src/agent/context.ts`**

Append this function to the existing file (after `saveMessage`):

```typescript
export async function loadHistory(
  userId: string
): Promise<Array<{ id: string; role: 'user' | 'assistant'; content: string }>> {
  const rows = await db
    .select({
      id: conversationMessages.id,
      role: conversationMessages.role,
      content: conversationMessages.content,
    })
    .from(conversationMessages)
    .where(eq(conversationMessages.userId, userId))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(WINDOW_SIZE)

  return rows
    .reverse()
    .filter(r => r.role === 'user' || r.role === 'assistant')
    .map(r => ({
      id: r.id,
      role: r.role as 'user' | 'assistant',
      content: r.content ?? '',
    }))
}
```

- [ ] **Step 2: Add failing test for `GET /chat/history` to `packages/backend/test/chat.test.ts`**

Add this import at the top (after existing imports):
```typescript
import { setLlmProvider } from '../src/lib/llm' // already imported
```

Add this describe block at the bottom of `chat.test.ts`:

```typescript
describe('GET /chat/history', () => {
  it('returns empty messages for new user', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/chat/history', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { messages: any[] }
    expect(body.messages).toEqual([])
  })

  it('returns saved conversation history', async () => {
    const { token } = await createUserAndToken()
    // Send first message (onboarding)
    await app.request('/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'halo' }),
    })
    const res = await app.request('/chat/history', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { messages: any[] }
    expect(body.messages.length).toBeGreaterThanOrEqual(2)
    expect(body.messages[0].role).toBe('user')
    expect(body.messages[0].content).toBe('halo')
    expect(body.messages.every((m: any) => m.id && m.role && m.content !== undefined)).toBe(true)
  })

  it('returns 401 without Authorization header', async () => {
    const res = await app.request('/chat/history')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 3: Run test — verify new tests fail**

```
pnpm test test/chat.test.ts
```

Expected: 3 new tests fail with 404

- [ ] **Step 4: Add `GET /chat/history` handler to `packages/backend/src/routes/chat.ts`**

```typescript
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { processMessage, loadHistory } from '../agent/engine'
```

Wait — `loadHistory` is in `context.ts`, not `engine.ts`. Import directly:

```typescript
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { processMessage } from '../agent/engine'
import { loadHistory } from '../agent/context'

export const chatRouter = new Hono()

chatRouter.get('/history', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const messages = await loadHistory(userId)
  return c.json({ messages })
})

chatRouter.post('/', authMiddleware, async (c) => {
  let body: { message?: unknown }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }
  const { message } = body

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return c.json({ error: 'Message is required' }, 400)
  }

  const userId = c.get('userId')
  const reply = await processMessage(userId, message.trim())

  return c.json({ reply })
})
```

- [ ] **Step 5: Run test — all chat tests pass**

```
pnpm test test/chat.test.ts
```

Expected: all 8 tests pass (5 existing + 3 new)

- [ ] **Step 6: Run full test suite**

```
pnpm test
```

Expected: all tests pass

- [ ] **Step 7: Update `packages/frontend/src/hooks/useChat.ts` to load history on mount**

```typescript
import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../lib/api'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load history on mount
  useEffect(() => {
    apiFetch<{ messages: Message[] }>('/chat/history')
      .then(data => {
        if (data.messages.length > 0) setMessages(data.messages)
      })
      .catch(() => {}) // silently fail — user starts fresh if history unavailable
  }, [])

  const send = useCallback(async (content: string) => {
    if (!content.trim() || loading) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setError(null)

    try {
      const data = await apiFetch<{ reply: string }>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: content.trim() }),
      })
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setError('Gagal mengirim pesan. Coba lagi.')
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
    } finally {
      setLoading(false)
    }
  }, [loading])

  return { messages, loading, error, send }
}
```

- [ ] **Step 8: Commit**

```
git add packages/backend/src/agent/context.ts packages/backend/src/routes/chat.ts packages/backend/test/chat.test.ts packages/frontend/src/hooks/useChat.ts
git commit -m "feat: add GET /chat/history endpoint and load history on chat page mount"
```

---

## Pre-Task Checklist

Before starting:
- [ ] `pnpm test` passes all 26 existing tests
- [ ] Backend running: `pnpm dev:backend` from root
- [ ] `GEMINI_API_KEY` set in `.env` for manual testing

## Completion Criteria

- [ ] All existing 26 tests still pass (no regressions)
- [ ] `tools-keuangan.test.ts`: create_transaction (5), get_balance (3), list_transactions (4) = 12 tests
- [ ] `tools-invoice.test.ts`: create_invoice (5), list_invoices (4), mark_invoice_paid (3) = 12 tests
- [ ] `chat.test.ts`: 3 new history tests pass
- [ ] Total: 26 + 12 + 12 + 3 = 53 tests
- [ ] Chat page refreshes and shows previous conversation
- [ ] Manual test: chatting about "catat penjualan 500rb" triggers `create_transaction`

## Notes for Plan 4

- Plan 4 covers Telegram integration and email OAuth — uses existing `telegramBotToken`, `telegramUserId`, `emailOauthToken` columns
- `schedule_report` and `get_report` tools (BullMQ-based) are deferred to Plan 4
- `create_custom_tool` (dynamic tool system) deferred to Plan 5
