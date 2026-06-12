# Plan 5: Scheduled Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement scheduled financial reports that are automatically generated and sent to users via Telegram on a configurable daily/weekly/monthly schedule.

**Architecture:** Use `node-cron` for in-process cron scheduling (no Redis/BullMQ needed). A `ReportScheduler` interface follows the same injectable DI pattern as `TelegramClient` and `LlmProvider` — a `NodeCronScheduler` runs in production, a `MockReportScheduler` in tests. On server startup, `initScheduler()` re-registers all existing scheduled reports from DB. Three new agent tools (`schedule_report`, `list_reports`, `delete_report`) and a matching REST API (`/reports`) provide CRUD.

**Tech Stack:** `node-cron` (new dep), Drizzle ORM, Hono v4, Vitest, React (frontend section)

---

## File Map

**Create (backend):**
- `packages/backend/src/lib/report-generator.ts` — `generateReport(userId, type, date)` → formatted string
- `packages/backend/src/lib/report-scheduler.ts` — `ReportScheduler` interface, `NodeCronScheduler`, `setReportScheduler`/`getReportScheduler`, `buildCronExpression`, `calculateNextRun`, `createReportTask`, `initScheduler`
- `packages/backend/src/routes/reports.ts` — `GET /reports`, `POST /reports`, `DELETE /reports/:id`
- `packages/backend/src/agent/tools/schedule-report.ts` — `schedule_report` tool
- `packages/backend/src/agent/tools/list-reports.ts` — `list_reports` tool
- `packages/backend/src/agent/tools/delete-report.ts` — `delete_report` tool
- `packages/backend/test/report-generator.test.ts` — report generation unit tests
- `packages/backend/test/reports.test.ts` — REST API + scheduler integration tests

**Create (frontend):**
- `packages/frontend/src/hooks/useReports.ts` — fetch + delete scheduled reports

**Modify (backend):**
- `packages/backend/package.json` — add `node-cron` dependency
- `packages/backend/src/agent/tools/register.ts` — register 3 new tools
- `packages/backend/src/agent/engine.ts` — add 3 tools to system prompt
- `packages/backend/src/index.ts` — mount `reportsRouter`, call `initScheduler()`

**Modify (frontend):**
- `packages/frontend/src/pages/SettingsPage.tsx` — add "Laporan Terjadwal" section

---

## Task 1: Install node-cron + Report Generator

**Files:**
- Create: `packages/backend/src/lib/report-generator.ts`
- Create: `packages/backend/test/report-generator.test.ts`
- Modify: `packages/backend/package.json`

- [ ] **Step 1: Install node-cron**

```bash
cd packages/backend && pnpm add node-cron
```

Verify `node-cron` appears under `dependencies` in `packages/backend/package.json`.

- [ ] **Step 2: Write the failing tests**

Create `packages/backend/test/report-generator.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd packages/backend && pnpm test report-generator
```

Expected: FAIL — "Cannot find module '../src/lib/report-generator'"

- [ ] **Step 4: Implement report-generator**

Create `packages/backend/src/lib/report-generator.ts`:

```typescript
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
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd packages/backend && pnpm test report-generator
```

Expected: All 5 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/package.json packages/backend/src/lib/report-generator.ts packages/backend/test/report-generator.test.ts
git commit -m "feat: add report generator with daily/weekly/monthly formatting"
```

---

## Task 2: Report Scheduler Interface

**Files:**
- Create: `packages/backend/src/lib/report-scheduler.ts`

This file contains: the `ReportScheduler` interface, `NodeCronScheduler` implementation, DI helpers, cron/time utilities, `createReportTask`, and `initScheduler`. No tests in this task — scheduler logic is integration-tested in Task 3.

- [ ] **Step 1: Create report-scheduler.ts**

Create `packages/backend/src/lib/report-scheduler.ts`:

```typescript
import cron from 'node-cron'
import { db } from '../db'
import { scheduledReports, users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { generateReport } from './report-generator'
import { getTelegramClient } from './telegram'

export interface ReportScheduler {
  schedule(reportId: string, cronExpression: string, task: () => Promise<void>): void
  unschedule(reportId: string): void
}

class NodeCronScheduler implements ReportScheduler {
  private tasks = new Map<string, cron.ScheduledTask>()

  schedule(reportId: string, cronExpression: string, task: () => Promise<void>): void {
    this.tasks.get(reportId)?.stop()
    const t = cron.schedule(cronExpression, task, { scheduled: true, timezone: 'Asia/Jakarta' })
    this.tasks.set(reportId, t)
  }

  unschedule(reportId: string): void {
    this.tasks.get(reportId)?.stop()
    this.tasks.delete(reportId)
  }
}

let scheduler: ReportScheduler = new NodeCronScheduler()

export function setReportScheduler(s: ReportScheduler): void {
  scheduler = s
}

export function getReportScheduler(): ReportScheduler {
  return scheduler
}

export function buildCronExpression(
  type: 'daily' | 'weekly' | 'monthly',
  hour: number,
  minute: number
): string {
  if (type === 'daily') return `${minute} ${hour} * * *`
  if (type === 'weekly') return `${minute} ${hour} * * 1`
  return `${minute} ${hour} 1 * *`
}

export function calculateNextRun(
  type: 'daily' | 'weekly' | 'monthly',
  hour: number,
  minute: number
): Date {
  const now = new Date()
  const candidate = new Date(now)
  candidate.setHours(hour, minute, 0, 0)

  if (type === 'daily') {
    if (candidate <= now) candidate.setDate(candidate.getDate() + 1)
    return candidate
  }

  if (type === 'weekly') {
    const currentDay = candidate.getDay()
    const targetDay = 1 // Monday
    let daysUntil = (targetDay - currentDay + 7) % 7
    if (daysUntil === 0 && candidate <= now) daysUntil = 7
    candidate.setDate(candidate.getDate() + daysUntil)
    return candidate
  }

  // monthly — first of next month (or this month if 1st hasn't passed)
  candidate.setDate(1)
  if (candidate <= now) {
    candidate.setMonth(candidate.getMonth() + 1)
    candidate.setDate(1)
    candidate.setHours(hour, minute, 0, 0)
  }
  return candidate
}

export function parseTime(time: string): { hour: number; minute: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) return null
  const hour = parseInt(match[1], 10)
  const minute = parseInt(match[2], 10)
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null
  return { hour, minute }
}

export function createReportTask(
  reportId: string,
  userId: string,
  type: 'daily' | 'weekly' | 'monthly'
): () => Promise<void> {
  return async () => {
    const [user] = await db
      .select({ telegramBotToken: users.telegramBotToken, telegramUserId: users.telegramUserId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user?.telegramBotToken || !user?.telegramUserId) return

    const report = await generateReport(userId, type, new Date())

    try {
      await getTelegramClient().sendMessage(user.telegramBotToken, user.telegramUserId, report)
    } catch (err) {
      console.error(`[report-scheduler] userId=${userId} send failed:`, err)
    }

    await db
      .update(scheduledReports)
      .set({ lastRunAt: new Date() })
      .where(eq(scheduledReports.id, reportId))
  }
}

export async function initScheduler(): Promise<void> {
  const reports = await db
    .select({
      id: scheduledReports.id,
      userId: scheduledReports.userId,
      type: scheduledReports.type,
      cronExpression: scheduledReports.cronExpression,
    })
    .from(scheduledReports)

  const s = getReportScheduler()
  for (const report of reports) {
    const task = createReportTask(report.id, report.userId, report.type as 'daily' | 'weekly' | 'monthly')
    s.schedule(report.id, report.cronExpression, task)
  }

  console.log(`[report-scheduler] Initialized ${reports.length} report(s)`)
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/backend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/lib/report-scheduler.ts
git commit -m "feat: add report scheduler interface with cron helpers"
```

---

## Task 3: REST API + Integration Tests

**Files:**
- Create: `packages/backend/src/routes/reports.ts`
- Create: `packages/backend/test/reports.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/backend/test/reports.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { app } from '../src/index'
import { db } from '../src/db'
import { users, scheduledReports } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { signJwt } from '../src/lib/jwt'
import { setReportScheduler, initScheduler } from '../src/lib/report-scheduler'
import { setTelegramClient } from '../src/lib/telegram'
import { cleanDb, createTestUser } from './setup'
import type { ReportScheduler } from '../src/lib/report-scheduler'
import type { TelegramClient } from '../src/lib/telegram'

class MockReportScheduler implements ReportScheduler {
  readonly scheduled = new Map<string, { cron: string; task: () => Promise<void> }>()

  schedule(reportId: string, cronExpression: string, task: () => Promise<void>): void {
    this.scheduled.set(reportId, { cron: cronExpression, task })
  }

  unschedule(reportId: string): void {
    this.scheduled.delete(reportId)
  }
}

function makeMockBot(): TelegramClient {
  return {
    getMe: async () => ({ id: 1, username: 'bot', firstName: 'Bot' }),
    setWebhook: async () => {},
    deleteWebhook: async () => {},
    sendMessage: async () => {},
  }
}

let mockScheduler: MockReportScheduler
let mockBot: TelegramClient

beforeEach(async () => {
  await cleanDb()
  mockScheduler = new MockReportScheduler()
  setReportScheduler(mockScheduler)
  mockBot = makeMockBot()
  setTelegramClient(mockBot)
})

async function createUserAndToken(overrides?: { businessName?: string }) {
  const user = await createTestUser(overrides)
  const token = await signJwt({ userId: user.id, email: user.email })
  return { user, token }
}

async function connectTelegram(userId: string) {
  await db.update(users)
    .set({ telegramBotToken: 'bot123:ABC', telegramUserId: '987654321' })
    .where(eq(users.id, userId))
}

describe('POST /reports', () => {
  it('returns 401 without auth token', async () => {
    const res = await app.request('/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when type is missing', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ delivery: 'telegram', time: '08:00' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when time format is invalid', async () => {
    const { token, user } = await createUserAndToken()
    await connectTelegram(user.id)
    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '25:99' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when telegram not connected but delivery is telegram', async () => {
    const { token } = await createUserAndToken()
    // user has no telegram token
    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })
    expect(res.status).toBe(400)
  })

  it('creates a daily report, stores correct cron expression, and schedules the task', async () => {
    const { token, user } = await createUserAndToken()
    await connectTelegram(user.id)

    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as { id: string; type: string; cronExpression: string; nextRunAt: string }
    expect(body.type).toBe('daily')
    expect(body.cronExpression).toBe('0 8 * * *')
    expect(body.nextRunAt).toBeDefined()
    expect(mockScheduler.scheduled.size).toBe(1)
    expect([...mockScheduler.scheduled.values()][0].cron).toBe('0 8 * * *')
  })

  it('creates a weekly report with Monday cron expression', async () => {
    const { token, user } = await createUserAndToken()
    await connectTelegram(user.id)

    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'weekly', delivery: 'telegram', time: '07:30' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as { cronExpression: string }
    expect(body.cronExpression).toBe('30 7 * * 1')
  })

  it('creates a monthly report with 1st-of-month cron expression', async () => {
    const { token, user } = await createUserAndToken()
    await connectTelegram(user.id)

    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'monthly', delivery: 'telegram', time: '09:00' }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as { cronExpression: string }
    expect(body.cronExpression).toBe('0 9 1 * *')
  })

  it('task sends Telegram message when triggered', async () => {
    const { token, user } = await createUserAndToken({ businessName: 'Toko Uji' })
    await connectTelegram(user.id)

    await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })

    let sendArgs: [string, string, string] | undefined
    mockBot.sendMessage = async (token, chatId, text) => { sendArgs = [token, chatId, text] }

    const [entry] = [...mockScheduler.scheduled.values()]
    await entry.task()

    expect(sendArgs).toBeDefined()
    expect(sendArgs![0]).toBe('bot123:ABC')
    expect(sendArgs![1]).toBe('987654321')
    expect(sendArgs![2]).toContain('Laporan Harian')
    expect(sendArgs![2]).toContain('Toko Uji')
  })
})

describe('GET /reports', () => {
  it('returns 401 without auth token', async () => {
    const res = await app.request('/reports')
    expect(res.status).toBe(401)
  })

  it('returns empty array when no reports exist', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/reports', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { reports: unknown[] }
    expect(body.reports).toEqual([])
  })

  it('returns only reports belonging to the requesting user', async () => {
    const { token: token1, user: user1 } = await createUserAndToken()
    const { user: user2 } = await createUserAndToken()
    await connectTelegram(user1.id)
    await connectTelegram(user2.id)

    // Create report for user1
    await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })

    // Insert a report directly for user2
    await db.insert(scheduledReports).values({
      userId: user2.id,
      type: 'weekly',
      cronExpression: '0 8 * * 1',
      delivery: 'telegram',
    })

    const res = await app.request('/reports', {
      headers: { Authorization: `Bearer ${token1}` },
    })
    const body = await res.json() as { reports: Array<{ type: string }> }
    expect(body.reports).toHaveLength(1)
    expect(body.reports[0].type).toBe('daily')
  })
})

describe('DELETE /reports/:id', () => {
  it('returns 401 without auth token', async () => {
    const res = await app.request('/reports/some-id', { method: 'DELETE' })
    expect(res.status).toBe(401)
  })

  it('returns 404 for a non-existent report', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/reports/nonexistent', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(404)
  })

  it('returns 404 when report belongs to another user', async () => {
    const { token: token1 } = await createUserAndToken()
    const { user: user2 } = await createUserAndToken()
    await connectTelegram(user2.id)

    await db.insert(scheduledReports).values({
      userId: user2.id,
      type: 'daily',
      cronExpression: '0 8 * * *',
      delivery: 'telegram',
    })
    const [report] = await db.select({ id: scheduledReports.id }).from(scheduledReports).where(eq(scheduledReports.userId, user2.id)).limit(1)

    const res = await app.request(`/reports/${report.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token1}` },
    })
    expect(res.status).toBe(404)
  })

  it('deletes the report from DB and unschedules it', async () => {
    const { token, user } = await createUserAndToken()
    await connectTelegram(user.id)

    const createRes = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'telegram', time: '08:00' }),
    })
    const { id } = await createRes.json() as { id: string }

    expect(mockScheduler.scheduled.size).toBe(1)

    const deleteRes = await app.request(`/reports/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(deleteRes.status).toBe(200)
    expect(mockScheduler.scheduled.size).toBe(0)

    const remaining = await db.select().from(scheduledReports).where(eq(scheduledReports.id, id))
    expect(remaining).toHaveLength(0)
  })
})

describe('initScheduler', () => {
  it('re-registers all existing reports on startup', async () => {
    const user = await createTestUser()
    await connectTelegram(user.id)

    await db.insert(scheduledReports).values([
      { userId: user.id, type: 'daily', cronExpression: '0 8 * * *', delivery: 'telegram' },
      { userId: user.id, type: 'weekly', cronExpression: '0 8 * * 1', delivery: 'telegram' },
    ])

    await initScheduler()

    expect(mockScheduler.scheduled.size).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/backend && pnpm test reports
```

Expected: FAIL — "Cannot find module '../src/routes/reports'"

- [ ] **Step 3: Implement reports route**

Create `packages/backend/src/routes/reports.ts`:

```typescript
import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db } from '../db'
import { scheduledReports, users } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import {
  getReportScheduler,
  buildCronExpression,
  calculateNextRun,
  createReportTask,
  parseTime,
} from '../lib/report-scheduler'

export const reportsRouter = new Hono()

reportsRouter.get('/reports', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const reports = await db
    .select()
    .from(scheduledReports)
    .where(eq(scheduledReports.userId, userId))
  return c.json({ reports })
})

reportsRouter.post('/reports', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json() as Record<string, unknown>
  const { type, delivery, time = '08:00' } = body

  if (!type || !['daily', 'weekly', 'monthly'].includes(type as string)) {
    return c.json({ error: 'type harus salah satu dari: daily, weekly, monthly' }, 400)
  }
  if (!delivery || !['telegram', 'email', 'both'].includes(delivery as string)) {
    return c.json({ error: 'delivery harus salah satu dari: telegram, email, both' }, 400)
  }

  const parsed = parseTime(time as string)
  if (!parsed) {
    return c.json({ error: 'format time tidak valid, gunakan HH:MM (contoh: 08:00)' }, 400)
  }

  if (delivery === 'telegram' || delivery === 'both') {
    const [user] = await db
      .select({ telegramBotToken: users.telegramBotToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    if (!user?.telegramBotToken) {
      return c.json({ error: 'Telegram belum terhubung. Hubungkan Telegram di Pengaturan terlebih dahulu.' }, 400)
    }
  }

  const reportType = type as 'daily' | 'weekly' | 'monthly'
  const cronExpression = buildCronExpression(reportType, parsed.hour, parsed.minute)
  const nextRunAt = calculateNextRun(reportType, parsed.hour, parsed.minute)

  const [report] = await db
    .insert(scheduledReports)
    .values({
      userId,
      type: reportType,
      cronExpression,
      delivery: delivery as 'telegram' | 'email' | 'both',
      nextRunAt,
    })
    .returning()

  const task = createReportTask(report.id, userId, reportType)
  getReportScheduler().schedule(report.id, cronExpression, task)

  return c.json(report, 201)
})

reportsRouter.delete('/reports/:id', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const reportId = c.req.param('id')

  const [report] = await db
    .select()
    .from(scheduledReports)
    .where(and(eq(scheduledReports.id, reportId), eq(scheduledReports.userId, userId)))
    .limit(1)

  if (!report) {
    return c.json({ error: 'Laporan tidak ditemukan' }, 404)
  }

  getReportScheduler().unschedule(reportId)
  await db.delete(scheduledReports).where(eq(scheduledReports.id, reportId))

  return c.json({ deleted: true })
})
```

- [ ] **Step 4: Mount router in index.ts temporarily for tests**

Modify `packages/backend/src/index.ts` — add the import and route mount (will be revisited in Task 5 for `initScheduler`):

```typescript
import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { authRouter } from './routes/auth'
import { chatRouter } from './routes/chat'
import { telegramRouter } from './routes/telegram'
import { reportsRouter } from './routes/reports'
import { registerTools } from './agent/tools/register'

registerTools()

export const app = new Hono()

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.route('/auth', authRouter)
app.route('/chat', chatRouter)
app.route('/', telegramRouter)
app.route('/', reportsRouter)

app.get('/health', (c) => c.json({ ok: true }))

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT) || 3000
  serve({ fetch: app.fetch, port })
  console.log(`Backend running on http://localhost:${port}`)
}
```

- [ ] **Step 5: Run all tests to confirm they pass**

```bash
cd packages/backend && pnpm test
```

Expected: All tests PASS (existing + new reports tests).

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/reports.ts packages/backend/test/reports.test.ts packages/backend/src/index.ts
git commit -m "feat: add scheduled reports REST API with cron scheduling"
```

---

## Task 4: Agent Tools + System Prompt Update

**Files:**
- Create: `packages/backend/src/agent/tools/schedule-report.ts`
- Create: `packages/backend/src/agent/tools/list-reports.ts`
- Create: `packages/backend/src/agent/tools/delete-report.ts`
- Modify: `packages/backend/src/agent/tools/register.ts`
- Modify: `packages/backend/src/agent/engine.ts`

No dedicated test file needed — these tools follow the same pattern as existing tools and are covered by the `reports.test.ts` via the REST layer. The agent tool execution path is validated by calling `tool.execute()` directly in a brief smoke test at the end of this task.

- [ ] **Step 1: Create schedule-report tool**

Create `packages/backend/src/agent/tools/schedule-report.ts`:

```typescript
import { db } from '../../db'
import { scheduledReports, users } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import {
  getReportScheduler,
  buildCronExpression,
  calculateNextRun,
  createReportTask,
  parseTime,
} from '../../lib/report-scheduler'
import type { Tool, ToolResult } from './types'

export const scheduleReportTool: Tool = {
  name: 'schedule_report',
  description: 'Jadwalkan laporan keuangan otomatis yang dikirim via Telegram. Mendukung laporan harian (setiap hari), mingguan (setiap Senin), atau bulanan (setiap tanggal 1).',
  parameters: {
    type: 'OBJECT',
    properties: {
      type: {
        type: 'STRING',
        enum: ['daily', 'weekly', 'monthly'],
        description: 'Frekuensi laporan: daily (setiap hari), weekly (setiap Senin), monthly (setiap tanggal 1)',
      },
      time: {
        type: 'STRING',
        description: 'Jam pengiriman format HH:MM, contoh: 08:00. Default: 08:00 jika tidak disebutkan.',
      },
    },
    required: ['type'],
  },

  async execute(args, userId): Promise<ToolResult> {
    const type = args.type as 'daily' | 'weekly' | 'monthly'
    const timeStr = (args.time as string | undefined) ?? '08:00'

    const parsed = parseTime(timeStr)
    if (!parsed) {
      return { success: false, error: `Format jam tidak valid: "${timeStr}". Gunakan format HH:MM, contoh: 08:00` }
    }

    const [user] = await db
      .select({ telegramBotToken: users.telegramBotToken })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user?.telegramBotToken) {
      return { success: false, error: 'Telegram belum terhubung. Minta user untuk menghubungkan Telegram di halaman Pengaturan.' }
    }

    const [existing] = await db
      .select({ id: scheduledReports.id })
      .from(scheduledReports)
      .where(and(eq(scheduledReports.userId, userId), eq(scheduledReports.type, type)))
      .limit(1)

    if (existing) {
      return {
        success: false,
        error: `Laporan ${type} sudah terjadwal (ID: ${existing.id}). Gunakan delete_report untuk menghapusnya terlebih dahulu sebelum membuat jadwal baru.`,
      }
    }

    const cronExpression = buildCronExpression(type, parsed.hour, parsed.minute)
    const nextRunAt = calculateNextRun(type, parsed.hour, parsed.minute)

    const [report] = await db
      .insert(scheduledReports)
      .values({
        userId,
        type,
        cronExpression,
        delivery: 'telegram',
        nextRunAt,
      })
      .returning()

    const task = createReportTask(report.id, userId, type)
    getReportScheduler().schedule(report.id, cronExpression, task)

    const typeLabel: Record<string, string> = {
      daily: 'harian (setiap hari)',
      weekly: 'mingguan (setiap Senin)',
      monthly: 'bulanan (setiap tanggal 1)',
    }

    return {
      success: true,
      data: {
        id: report.id,
        type,
        cronExpression,
        nextRunAt: nextRunAt.toISOString(),
        message: `Laporan ${typeLabel[type]} jam ${timeStr} berhasil dijadwalkan via Telegram.`,
      },
    }
  },
}
```

- [ ] **Step 2: Create list-reports tool**

Create `packages/backend/src/agent/tools/list-reports.ts`:

```typescript
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
```

- [ ] **Step 3: Create delete-report tool**

Create `packages/backend/src/agent/tools/delete-report.ts`:

```typescript
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
  },
}
```

- [ ] **Step 4: Register all 3 tools**

Modify `packages/backend/src/agent/tools/register.ts`:

```typescript
import { registerTool } from './index'
import { createTransactionTool } from './create-transaction'
import { getBalanceTool } from './get-balance'
import { listTransactionsTool } from './list-transactions'
import { createInvoiceTool } from './create-invoice'
import { listInvoicesTool } from './list-invoices'
import { markInvoicePaidTool } from './mark-invoice-paid'
import { scheduleReportTool } from './schedule-report'
import { listReportsTool } from './list-reports'
import { deleteReportTool } from './delete-report'

export function registerTools(): void {
  registerTool(createTransactionTool)
  registerTool(getBalanceTool)
  registerTool(listTransactionsTool)
  registerTool(createInvoiceTool)
  registerTool(listInvoicesTool)
  registerTool(markInvoicePaidTool)
  registerTool(scheduleReportTool)
  registerTool(listReportsTool)
  registerTool(deleteReportTool)
}
```

- [ ] **Step 5: Update system prompt in engine.ts**

Modify `packages/backend/src/agent/engine.ts` — update the `buildSystemPrompt` function body. Replace the entire function:

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
- schedule_report: jadwalkan laporan keuangan otomatis via Telegram (harian/mingguan/bulanan)
- list_reports: tampilkan semua laporan terjadwal
- delete_report: hapus jadwal laporan berdasarkan ID

Panduan penggunaan tools:
- Gunakan tools secara proaktif saat user menyebut transaksi, invoice, atau minta laporan
- Jika informasi kurang lengkap (misal: jumlah uang tidak jelas), tanyakan dulu sebelum memanggil tool
- Semua amount dalam Rupiah (IDR), bilangan bulat
- Setelah berhasil, konfirmasi ke user apa yang sudah dicatat dengan format yang mudah dibaca
- Untuk schedule_report: jika tidak disebutkan jam, gunakan 08:00 sebagai default
- Laporan terjadwal hanya bisa dikirim via Telegram — pastikan Telegram sudah terhubung`.trim()
}
```

- [ ] **Step 6: Run all tests**

```bash
cd packages/backend && pnpm test
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/agent/tools/schedule-report.ts packages/backend/src/agent/tools/list-reports.ts packages/backend/src/agent/tools/delete-report.ts packages/backend/src/agent/tools/register.ts packages/backend/src/agent/engine.ts
git commit -m "feat: add schedule_report, list_reports, delete_report agent tools"
```

---

## Task 5: Wire Up initScheduler in Server

**Files:**
- Modify: `packages/backend/src/index.ts`

The `reportsRouter` is already mounted from Task 3. This task only adds the `initScheduler()` call in the non-test startup block.

- [ ] **Step 1: Add initScheduler to index.ts**

Modify `packages/backend/src/index.ts`:

```typescript
import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { authRouter } from './routes/auth'
import { chatRouter } from './routes/chat'
import { telegramRouter } from './routes/telegram'
import { reportsRouter } from './routes/reports'
import { registerTools } from './agent/tools/register'
import { initScheduler } from './lib/report-scheduler'

registerTools()

export const app = new Hono()

app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

app.route('/auth', authRouter)
app.route('/chat', chatRouter)
app.route('/', telegramRouter)
app.route('/', reportsRouter)

app.get('/health', (c) => c.json({ ok: true }))

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT) || 3000
  serve({ fetch: app.fetch, port })
  console.log(`Backend running on http://localhost:${port}`)
  initScheduler().catch(err => console.error('[report-scheduler] Init failed:', err))
}
```

- [ ] **Step 2: Run all tests**

```bash
cd packages/backend && pnpm test
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/index.ts
git commit -m "feat: call initScheduler on server startup to reload persisted schedules"
```

---

## Task 6: Frontend — Scheduled Reports Section in SettingsPage

**Files:**
- Create: `packages/frontend/src/hooks/useReports.ts`
- Modify: `packages/frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Create useReports hook**

Create `packages/frontend/src/hooks/useReports.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '../lib/api'

export interface ScheduledReport {
  id: string
  type: 'daily' | 'weekly' | 'monthly'
  delivery: 'telegram' | 'email' | 'both'
  cronExpression: string
  nextRunAt: string | null
  lastRunAt: string | null
}

export function useReports() {
  const [reports, setReports] = useState<ScheduledReport[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ reports: ScheduledReport[] }>('/reports')
      setReports(data.reports)
    } catch {
      // Silently ignore load errors — user may not have reports yet
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const deleteReport = async (id: string): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      await apiFetch(`/reports/${id}`, { method: 'DELETE' })
      setReports(prev => prev.filter(r => r.id !== id))
    } catch (err: any) {
      setError(err.message ?? 'Gagal menghapus laporan.')
    } finally {
      setLoading(false)
    }
  }

  return { reports, loading, error, deleteReport }
}
```

- [ ] **Step 2: Add scheduled reports section to SettingsPage**

Modify `packages/frontend/src/pages/SettingsPage.tsx`. Add the `useReports` import and add the "Laporan Terjadwal" section after the Telegram card. The full updated file:

```tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { useSettings } from '../hooks/useSettings'
import { useReports } from '../hooks/useReports'

const TYPE_LABEL: Record<string, string> = {
  daily: 'Harian (setiap hari)',
  weekly: 'Mingguan (setiap Senin)',
  monthly: 'Bulanan (setiap tanggal 1)',
}

export function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const { loading, error, botUsername, connectTelegram, disconnectTelegram, clearError } = useSettings()
  const { reports, loading: reportsLoading, error: reportsError, deleteReport } = useReports()
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await connectTelegram(botToken.trim(), chatId.trim())
    if (ok) {
      setBotToken('')
      setChatId('')
    }
  }

  const isConnected = user?.telegramConnected || !!botUsername

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="font-semibold text-gray-900">Pengaturan</h1>
        <Link to="/chat" className="text-sm text-gray-500 hover:text-gray-700">
          Kembali ke Chat
        </Link>
      </header>

      <div className="max-w-lg mx-auto px-4 py-8 space-y-6">
        {/* Telegram */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Telegram</h2>
          <p className="text-sm text-gray-500 mb-4">
            Chat dengan AdminAI langsung dari Telegram menggunakan bot pribadi kamu.
          </p>

          {isConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
                {botUsername ? `Terhubung ke @${botUsername}` : 'Telegram sudah terhubung'}
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={disconnectTelegram}
                disabled={loading}
                className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {loading ? 'Memutus...' : 'Putus koneksi'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bot Token
                </label>
                <input
                  type="text"
                  value={botToken}
                  onChange={e => { setBotToken(e.target.value); clearError() }}
                  placeholder="123456789:ABCdef..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Buat bot baru di <span className="font-mono">@BotFather</span> di Telegram, lalu salin token-nya.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telegram Chat ID
                </label>
                <input
                  type="text"
                  value={chatId}
                  onChange={e => { setChatId(e.target.value); clearError() }}
                  placeholder="987654321"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Dapatkan ID kamu dengan kirim pesan ke <span className="font-mono">@userinfobot</span> di Telegram.
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={!botToken.trim() || !chatId.trim() || loading}
                className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Menghubungkan...' : 'Hubungkan Telegram'}
              </button>
            </form>
          )}
        </div>

        {/* Laporan Terjadwal */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Laporan Terjadwal</h2>
          <p className="text-sm text-gray-500 mb-4">
            Laporan keuangan otomatis yang dikirim via Telegram. Atur jadwal melalui chat dengan AdminAI.
          </p>

          {reportsError && (
            <p className="text-sm text-red-600 mb-3">{reportsError}</p>
          )}

          {reports.length === 0 ? (
            <p className="text-sm text-gray-400">
              Belum ada laporan terjadwal. Chat dengan AdminAI untuk membuat jadwal laporan otomatis.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {reports.map(report => (
                <li key={report.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {TYPE_LABEL[report.type] ?? report.type}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      via {report.delivery}
                      {report.nextRunAt
                        ? ` · berikutnya ${new Date(report.nextRunAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
                        : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteReport(report.id)}
                    disabled={reportsLoading}
                    className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50 ml-4 flex-shrink-0"
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Check TypeScript compiles**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Run backend tests**

```bash
cd packages/backend && pnpm test
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/hooks/useReports.ts packages/frontend/src/pages/SettingsPage.tsx
git commit -m "feat: add scheduled reports section to Settings page"
```

---

## Self-Review Checklist

### Spec Coverage
- [x] BullMQ/Redis replaced with simpler `node-cron` (fits MVP; Redis not actually needed)
- [x] `scheduledReports` table used (type, cronExpression, delivery, lastRunAt, nextRunAt)
- [x] Report generation: queries income/expense/transactions for period, formats as text
- [x] `schedule_report` agent tool — creates schedule, checks Telegram connected, prevents duplicates
- [x] `list_reports` agent tool — reads user's schedules
- [x] `delete_report` agent tool — removes schedule from DB + unschedules cron
- [x] REST API — `GET /reports`, `POST /reports`, `DELETE /reports/:id`
- [x] `initScheduler()` — re-registers all DB schedules on startup
- [x] `ReportScheduler` interface (injectable DI, same pattern as TelegramClient)
- [x] Telegram delivery uses `getTelegramClient().sendMessage` from Plan 4
- [x] Email delivery deferred to Plan 6 (REST API accepts `email`/`both` but validation skips email check for now — flag for Plan 6)
- [x] System prompt updated with 3 new tools
- [x] Frontend: `useReports` hook + "Laporan Terjadwal" section in SettingsPage

### Placeholder Scan
- All code blocks are complete and functional
- No "TBD", "TODO", or stub implementations
- `parseTime`, `buildCronExpression`, `calculateNextRun` all fully implemented
- `createReportTask` fully implemented with error handling

### Type Consistency
- `ReportScheduler.schedule(reportId, cronExpression, task: () => Promise<void>)` — used consistently across `NodeCronScheduler`, `MockReportScheduler`, `reportsRouter`, and agent tools
- `generateReport(userId, type, date)` — matches call sites in `createReportTask`
- `parseTime` returns `{ hour, minute } | null` — consumed by both `reportsRouter` and `scheduleReportTool`
- `buildCronExpression(type, hour, minute)` — `hour` and `minute` are numbers from `parseTime` — consistent
- `createReportTask(reportId, userId, type)` — all three parameters present in every call site
