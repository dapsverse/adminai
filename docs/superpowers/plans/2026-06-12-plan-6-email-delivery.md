# Email Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan pengiriman laporan terjadwal via email (SMTP), sehingga user bisa memilih delivery `telegram`, `email`, atau `both`.

**Architecture:** Buat injectable `EmailClient` interface (pola identik dengan `TelegramClient`), implementasikan dengan nodemailer menggunakan SMTP dari environment variables (shared server config, bukan per-user). Update `createReportTask` di `report-scheduler.ts` agar mendukung semua tiga mode delivery. Update agent tool `schedule_report` agar user bisa memilih delivery via chat.

**Tech Stack:** nodemailer (SMTP), Vitest (tes), Hono (REST), Drizzle ORM

---

## File Map

**New files:**
- `packages/backend/src/lib/email.ts` — `EmailClient` interface, `NodemailerEmailClient`, `setEmailClient`/`getEmailClient`/`isEmailConfigured` DI helpers
- `packages/backend/test/email.test.ts` — unit tests untuk `isEmailConfigured` dan error handling

**Modified files:**
- `packages/backend/src/lib/report-scheduler.ts` — tambah `delivery` param ke `createReportTask`, tambah `buildEmailSubject`, update `initScheduler` select, update caller internal
- `packages/backend/src/routes/reports.ts` — tambah SMTP check untuk delivery `email`/`both`, pass `delivery` ke `createReportTask`
- `packages/backend/src/agent/tools/schedule-report.ts` — tambah `delivery` parameter, hapus hardcode `'telegram'`, tambah validasi email/telegram per delivery
- `packages/backend/src/agent/engine.ts` — update system prompt: hapus note "email belum tersedia", tambah guidance delivery options
- `packages/backend/test/reports.test.ts` — tambah `MockEmailClient`, tests untuk email delivery di REST dan task trigger
- `packages/frontend/src/pages/SettingsPage.tsx` — tambah `DELIVERY_LABEL` map, tampilkan label human-readable

---

### Task 1: EmailClient interface + nodemailer implementation

**Files:**
- Create: `packages/backend/src/lib/email.ts`
- Create: `packages/backend/test/email.test.ts`

- [ ] **Step 1: Install nodemailer**

```bash
cd packages/backend
pnpm add nodemailer
pnpm add -D @types/nodemailer
```

Expected: `nodemailer` muncul di `dependencies` di `package.json`.

- [ ] **Step 2: Tulis failing test**

Buat `packages/backend/test/email.test.ts`:

```typescript
import { describe, it, expect, afterEach, vi } from 'vitest'
import { isEmailConfigured, getEmailClient, setEmailClient, NodemailerEmailClient } from '../src/lib/email'
import type { EmailClient } from '../src/lib/email'

class MockEmailClient implements EmailClient {
  readonly sent: Array<{ to: string; subject: string; text: string }> = []
  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    this.sent.push({ to, subject, text })
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isEmailConfigured', () => {
  it('returns false when SMTP_HOST is missing', () => {
    vi.stubEnv('SMTP_HOST', '')
    vi.stubEnv('SMTP_USER', 'user')
    vi.stubEnv('SMTP_PASS', 'pass')
    expect(isEmailConfigured()).toBe(false)
  })

  it('returns false when SMTP_USER is missing', () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com')
    vi.stubEnv('SMTP_USER', '')
    vi.stubEnv('SMTP_PASS', 'pass')
    expect(isEmailConfigured()).toBe(false)
  })

  it('returns false when SMTP_PASS is missing', () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com')
    vi.stubEnv('SMTP_USER', 'user')
    vi.stubEnv('SMTP_PASS', '')
    expect(isEmailConfigured()).toBe(false)
  })

  it('returns true when all SMTP vars are set', () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com')
    vi.stubEnv('SMTP_USER', 'user')
    vi.stubEnv('SMTP_PASS', 'pass')
    expect(isEmailConfigured()).toBe(true)
  })
})

describe('NodemailerEmailClient', () => {
  it('throws when SMTP not configured', async () => {
    vi.stubEnv('SMTP_HOST', '')
    vi.stubEnv('SMTP_USER', '')
    vi.stubEnv('SMTP_PASS', '')
    const client = new NodemailerEmailClient()
    await expect(client.sendEmail('to@example.com', 'Subject', 'Body')).rejects.toThrow('SMTP tidak dikonfigurasi')
  })
})

describe('getEmailClient / setEmailClient', () => {
  it('returns MockEmailClient after setEmailClient', async () => {
    const mock = new MockEmailClient()
    setEmailClient(mock)
    await getEmailClient().sendEmail('a@b.com', 'Hi', 'Body')
    expect(mock.sent).toHaveLength(1)
    expect(mock.sent[0].to).toBe('a@b.com')
  })
})
```

- [ ] **Step 3: Jalankan test, pastikan FAIL**

```bash
cd packages/backend && pnpm test test/email.test.ts
```

Expected: FAIL dengan "Cannot find module '../src/lib/email'"

- [ ] **Step 4: Implementasikan `email.ts`**

Buat `packages/backend/src/lib/email.ts`:

```typescript
import nodemailer from 'nodemailer'

export interface EmailClient {
  sendEmail(to: string, subject: string, text: string): Promise<void>
}

export class NodemailerEmailClient implements EmailClient {
  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    const host = process.env.SMTP_HOST
    const port = parseInt(process.env.SMTP_PORT ?? '587', 10)
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const from = process.env.EMAIL_FROM ?? 'AdminAI <reports@adminai.id>'

    if (!host || !user || !pass) {
      throw new Error('SMTP tidak dikonfigurasi. Set SMTP_HOST, SMTP_USER, SMTP_PASS di environment.')
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })

    await transporter.sendMail({ from, to, subject, text })
  }
}

let client: EmailClient = new NodemailerEmailClient()

export function setEmailClient(c: EmailClient): void {
  client = c
}

export function getEmailClient(): EmailClient {
  return client
}

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}
```

- [ ] **Step 5: Jalankan test, pastikan PASS**

```bash
cd packages/backend && pnpm test test/email.test.ts
```

Expected: 6 tests passed

- [ ] **Step 6: Jalankan full test suite, pastikan tidak ada regresi**

```bash
cd packages/backend && pnpm test
```

Expected: semua 91 tests pass (+ 6 baru = 97 total)

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/lib/email.ts packages/backend/test/email.test.ts packages/backend/package.json packages/backend/pnpm-lock.yaml
git commit -m "feat: add injectable EmailClient with nodemailer and SMTP env config"
```

---

### Task 2: Update createReportTask untuk multi-delivery

**Files:**
- Modify: `packages/backend/src/lib/report-scheduler.ts` (baris 1-7 imports, 92-121 createReportTask, 123-145 initScheduler)

- [ ] **Step 1: Update `report-scheduler.ts`**

Di bagian imports (baris 1-6), tambahkan import `getEmailClient`:

```typescript
import cron from 'node-cron'
import { db } from '../db'
import { scheduledReports, users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { generateReport } from './report-generator'
import { getTelegramClient } from './telegram'
import { getEmailClient } from './email'
```

Tambahkan helper `buildEmailSubject` setelah `parseTime` (sebelum `createReportTask`):

```typescript
function buildEmailSubject(type: 'daily' | 'weekly' | 'monthly'): string {
  const labels: Record<string, string> = {
    daily: 'Laporan Harian',
    weekly: 'Laporan Mingguan',
    monthly: 'Laporan Bulanan',
  }
  return `[AdminAI] ${labels[type]}`
}
```

Ganti seluruh `createReportTask` (baris 92-121) dengan versi yang mendukung `delivery`:

```typescript
export function createReportTask(
  reportId: string,
  userId: string,
  type: 'daily' | 'weekly' | 'monthly',
  delivery: 'telegram' | 'email' | 'both' = 'telegram'
): () => Promise<void> {
  return async () => {
    try {
      const [user] = await db
        .select({
          email: users.email,
          telegramBotToken: users.telegramBotToken,
          telegramUserId: users.telegramUserId,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      if (!user) return

      const report = await generateReport(userId, type, new Date())

      if ((delivery === 'telegram' || delivery === 'both') && user.telegramBotToken && user.telegramUserId) {
        await getTelegramClient().sendMessage(user.telegramBotToken, user.telegramUserId, report)
      }

      if (delivery === 'email' || delivery === 'both') {
        await getEmailClient().sendEmail(user.email, buildEmailSubject(type), report)
      }

      await db
        .update(scheduledReports)
        .set({ lastRunAt: new Date() })
        .where(eq(scheduledReports.id, reportId))
    } catch (err) {
      console.error(`[report-scheduler] reportId=${reportId} userId=${userId} send failed:`, err)
    }
  }
}
```

Update `initScheduler` — tambahkan `delivery` ke select dan ke `createReportTask` call. Ganti blok select dan loop (baris 123-145):

```typescript
export async function initScheduler(): Promise<void> {
  const reports = await db
    .select({
      id: scheduledReports.id,
      userId: scheduledReports.userId,
      type: scheduledReports.type,
      cronExpression: scheduledReports.cronExpression,
      delivery: scheduledReports.delivery,
    })
    .from(scheduledReports)

  const s = getReportScheduler()
  for (const report of reports) {
    if (!validTypes.includes(report.type as ValidType)) {
      console.warn(`[report-scheduler] Unknown report type "${report.type}", skipping reportId=${report.id}`)
      continue
    }
    try {
      const task = createReportTask(
        report.id,
        report.userId,
        report.type as ValidType,
        report.delivery as 'telegram' | 'email' | 'both'
      )
      s.schedule(report.id, report.cronExpression, task)
    } catch (err) {
      console.error(`[report-scheduler] Failed to schedule reportId=${report.id}:`, err)
    }
  }

  console.log(`[report-scheduler] Initialized ${reports.length} report(s)`)
}
```

- [ ] **Step 2: Jalankan test suite, pastikan tidak ada regresi**

Existing tests masih pass karena `delivery` default `'telegram'` — callers yang belum diupdate masih compile dan benar secara runtime.

```bash
cd packages/backend && pnpm test
```

Expected: 97 tests pass (semua)

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/lib/report-scheduler.ts
git commit -m "feat: add delivery param to createReportTask, support email and both modes"
```

---

### Task 3: Update REST route, agent tool, dan tests

**Files:**
- Modify: `packages/backend/src/routes/reports.ts`
- Modify: `packages/backend/src/agent/tools/schedule-report.ts`
- Modify: `packages/backend/test/reports.test.ts`

- [ ] **Step 1: Update `routes/reports.ts` — tambah SMTP check dan pass delivery ke createReportTask**

Tambahkan import `isEmailConfigured` di bagian imports (setelah import dari `report-scheduler`):

```typescript
import {
  getReportScheduler,
  buildCronExpression,
  calculateNextRun,
  createReportTask,
  parseTime,
} from '../lib/report-scheduler'
import { isEmailConfigured } from '../lib/email'
```

Setelah blok Telegram check (setelah baris yang mengecek `telegramBotToken`), tambahkan email check. Tambahkan blok ini sebelum duplicate check:

```typescript
  if (delivery === 'email' || delivery === 'both') {
    if (!isEmailConfigured()) {
      return c.json({ error: 'Email belum dikonfigurasi di server. Hubungi administrator AdminAI.' }, 400)
    }
  }
```

Pada baris `const task = createReportTask(...)` (baris 80), update untuk pass `delivery`:

```typescript
  const task = createReportTask(report.id, userId, reportType, delivery as 'telegram' | 'email' | 'both')
```

- [ ] **Step 2: Update `schedule-report.ts` — tambah delivery parameter**

Ganti seluruh isi file `packages/backend/src/agent/tools/schedule-report.ts`:

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
import { isEmailConfigured } from '../../lib/email'
import type { Tool, ToolResult } from './types'

export const scheduleReportTool: Tool = {
  name: 'schedule_report',
  description: 'Jadwalkan laporan keuangan otomatis. Mendukung laporan harian (setiap hari), mingguan (setiap Senin), atau bulanan (setiap tanggal 1). Bisa dikirim via Telegram, Email, atau keduanya.',
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
      delivery: {
        type: 'STRING',
        enum: ['telegram', 'email', 'both'],
        description: 'Metode pengiriman: telegram (default), email, atau both (Telegram & Email bersamaan).',
      },
    },
    required: ['type'],
  },

  async execute(args, userId): Promise<ToolResult> {
    const type = args.type as 'daily' | 'weekly' | 'monthly'
    const timeStr = (args.time as string | undefined) ?? '08:00'
    const delivery = (args.delivery as string | undefined) ?? 'telegram'

    const parsed = parseTime(timeStr)
    if (!parsed) {
      return { success: false, error: `Format jam tidak valid: "${timeStr}". Gunakan format HH:MM, contoh: 08:00` }
    }

    if (!['telegram', 'email', 'both'].includes(delivery)) {
      return { success: false, error: `Delivery tidak valid: "${delivery}". Pilihan: telegram, email, both` }
    }

    if ((delivery === 'email' || delivery === 'both') && !isEmailConfigured()) {
      return { success: false, error: 'Email belum dikonfigurasi di server AdminAI.' }
    }

    try {
      if (delivery === 'telegram' || delivery === 'both') {
        const [user] = await db
          .select({ telegramBotToken: users.telegramBotToken })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1)
        if (!user?.telegramBotToken) {
          return { success: false, error: 'Telegram belum terhubung. Hubungkan Telegram di halaman Pengaturan terlebih dahulu.' }
        }
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
          delivery: delivery as 'telegram' | 'email' | 'both',
          nextRunAt,
        })
        .returning()

      const task = createReportTask(report.id, userId, type, delivery as 'telegram' | 'email' | 'both')
      getReportScheduler().schedule(report.id, cronExpression, task)

      const typeLabel: Record<string, string> = {
        daily: 'harian (setiap hari)',
        weekly: 'mingguan (setiap Senin)',
        monthly: 'bulanan (setiap tanggal 1)',
      }
      const deliveryLabel: Record<string, string> = {
        telegram: 'Telegram',
        email: 'Email',
        both: 'Telegram & Email',
      }

      return {
        success: true,
        data: {
          id: report.id,
          type,
          delivery,
          cronExpression,
          nextRunAt: nextRunAt.toISOString(),
          message: `Laporan ${typeLabel[type]} jam ${timeStr} berhasil dijadwalkan via ${deliveryLabel[delivery]}.`,
        },
      }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}
```

- [ ] **Step 3: Tulis failing tests untuk email delivery**

Update `packages/backend/test/reports.test.ts`:

**1. Update existing vitest import** — tambahkan `afterEach` dan `vi` ke import yang sudah ada (baris 1):

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
```

**2. Tambahkan imports baru** setelah baris `import { setTelegramClient }`:

```typescript
import { setEmailClient } from '../src/lib/email'
import type { EmailClient } from '../src/lib/email'
import { createReportTask } from '../src/lib/report-scheduler'
```

**3. Tambahkan `MockEmailClient` class** setelah `MockReportScheduler` class:

```typescript
class MockEmailClient implements EmailClient {
  readonly sent: Array<{ to: string; subject: string; text: string }> = []
  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    this.sent.push({ to, subject, text })
  }
}
```

**4. Update `let` declarations** setelah `MockEmailClient` class — tambahkan `mockEmail`:

```typescript
let mockScheduler: MockReportScheduler
let mockBot: TelegramClient
let mockEmail: MockEmailClient
```

**5. Update `beforeEach`** — tambahkan dua baris untuk mockEmail:

```typescript
beforeEach(async () => {
  await cleanDb()
  mockScheduler = new MockReportScheduler()
  setReportScheduler(mockScheduler)
  mockBot = makeMockBot()
  setTelegramClient(mockBot)
  mockEmail = new MockEmailClient()
  setEmailClient(mockEmail)
})
```

**6. Tambahkan `afterEach`** setelah `beforeEach`:

```typescript
afterEach(() => {
  vi.unstubAllEnvs()
})
```

Tambahkan describe block baru di akhir file:

```typescript
describe('POST /reports — email delivery', () => {
  it('returns 400 when delivery is email and SMTP not configured', async () => {
    vi.stubEnv('SMTP_HOST', '')
    const { token } = await createUserAndToken()
    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'email', time: '08:00' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toMatch(/email belum dikonfigurasi/i)
  })

  it('creates email-delivery report when SMTP configured', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com')
    vi.stubEnv('SMTP_USER', 'user')
    vi.stubEnv('SMTP_PASS', 'pass')
    const { token } = await createUserAndToken()
    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'email', time: '08:00' }),
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { delivery: string }
    expect(body.delivery).toBe('email')
  })

  it('returns 400 for both delivery when SMTP not configured', async () => {
    vi.stubEnv('SMTP_HOST', '')
    const { token, user } = await createUserAndToken()
    await connectTelegram(user.id)
    const res = await app.request('/reports', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'daily', delivery: 'both', time: '08:00' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('createReportTask — email delivery', () => {
  it('sends email when delivery is email', async () => {
    const { user } = await createUserAndToken()
    const [inserted] = await db.insert(scheduledReports).values({
      userId: user.id,
      type: 'daily',
      delivery: 'email',
      cronExpression: '0 8 * * *',
      nextRunAt: new Date(),
    }).returning()

    const task = createReportTask(inserted.id, user.id, 'daily', 'email')
    await task()

    expect(mockEmail.sent).toHaveLength(1)
    expect(mockEmail.sent[0].to).toBe(user.email)
    expect(mockEmail.sent[0].subject).toContain('Laporan Harian')
  })

  it('sends both telegram and email when delivery is both', async () => {
    const { user } = await createUserAndToken()
    await connectTelegram(user.id)

    let telegramSent = false
    setTelegramClient({
      ...makeMockBot(),
      sendMessage: async () => { telegramSent = true },
    })

    const [inserted] = await db.insert(scheduledReports).values({
      userId: user.id,
      type: 'daily',
      delivery: 'both',
      cronExpression: '0 8 * * *',
      nextRunAt: new Date(),
    }).returning()

    const task = createReportTask(inserted.id, user.id, 'daily', 'both')
    await task()

    expect(telegramSent).toBe(true)
    expect(mockEmail.sent).toHaveLength(1)
  })

  it('skips telegram when telegram not connected and delivery is both', async () => {
    const { user } = await createUserAndToken()
    // No connectTelegram — telegramBotToken and telegramUserId are null

    const [inserted] = await db.insert(scheduledReports).values({
      userId: user.id,
      type: 'daily',
      delivery: 'both',
      cronExpression: '0 8 * * *',
      nextRunAt: new Date(),
    }).returning()

    let telegramCalled = false
    setTelegramClient({
      ...makeMockBot(),
      sendMessage: async () => { telegramCalled = true },
    })

    const task = createReportTask(inserted.id, user.id, 'daily', 'both')
    await task()

    expect(telegramCalled).toBe(false)
    expect(mockEmail.sent).toHaveLength(1)
  })
})
```

- [ ] **Step 4: Jalankan tests, pastikan fail dulu**

```bash
cd packages/backend && pnpm test test/reports.test.ts
```

Expected: error compile karena `createReportTask` belum diimport di test file, dan import baru belum ada.

- [ ] **Step 5: Jalankan full test suite setelah semua perubahan**

```bash
cd packages/backend && pnpm test
```

Expected: semua 97 + 6 baru = 103 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/reports.ts packages/backend/src/agent/tools/schedule-report.ts packages/backend/test/reports.test.ts
git commit -m "feat: enable email delivery option in REST route and schedule_report agent tool"
```

---

### Task 4: Update system prompt dan frontend delivery labels

**Files:**
- Modify: `packages/backend/src/agent/engine.ts`
- Modify: `packages/frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Update `engine.ts` system prompt**

Di `buildSystemPrompt`, ubah baris tool description `schedule_report` dari:

```
- schedule_report: jadwalkan laporan keuangan otomatis via Telegram (harian/mingguan/bulanan)
```

menjadi:

```
- schedule_report: jadwalkan laporan keuangan otomatis (harian/mingguan/bulanan), kirim via telegram/email/both
```

Ganti dua baris panduan terakhir yang menyebut Telegram-only dan email tidak tersedia:

```
- Untuk schedule_report: jika tidak disebutkan jam, gunakan 08:00 sebagai default
- Laporan terjadwal saat ini hanya bisa dikirim via Telegram — pastikan Telegram sudah terhubung
- Pengiriman via email belum tersedia (akan ditambahkan di versi mendatang)
```

menjadi:

```
- Untuk schedule_report: jika tidak disebutkan jam, gunakan 08:00 sebagai default; jika tidak disebutkan delivery, gunakan telegram
- Delivery options: telegram (butuh Telegram terhubung), email (butuh SMTP server), both (keduanya)
- Jika user minta via email tapi server belum dikonfigurasi, tool akan mengembalikan error — sampaikan ke user
```

- [ ] **Step 2: Update `SettingsPage.tsx` — delivery label**

Di `packages/frontend/src/pages/SettingsPage.tsx`, tambahkan `DELIVERY_LABEL` map setelah `TYPE_LABEL`:

```typescript
const DELIVERY_LABEL: Record<string, string> = {
  telegram: 'Telegram',
  email: 'Email',
  both: 'Telegram & Email',
}
```

Ubah baris yang menampilkan delivery dari:

```tsx
via {report.delivery}
```

menjadi:

```tsx
via {DELIVERY_LABEL[report.delivery] ?? report.delivery}
```

- [ ] **Step 3: TypeScript check frontend**

```bash
cd packages/frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Jalankan full backend test suite satu kali lagi**

```bash
cd packages/backend && pnpm test
```

Expected: 103 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/agent/engine.ts packages/frontend/src/pages/SettingsPage.tsx
git commit -m "feat: update system prompt for email delivery, add delivery label in Settings UI"
```
