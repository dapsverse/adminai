# Plan 4: Telegram Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to connect their own Telegram bot to AdminAI and chat via Telegram using the same agent engine as the web UI.

**Architecture:** Each user creates a personal Telegram bot via BotFather and provides the token + their Telegram chat ID through the Settings page. AdminAI verifies the token, registers a webhook URL (`POST /telegram/webhook/:userId`) on Telegram, then routes incoming updates through `processMessage()`. Replies are sent back via the Telegram Bot API. A `TelegramClient` interface with `setTelegramClient()` enables test injection — same pattern as `LlmProvider`. Conversation messages save with `channel: 'telegram'` for future analytics.

**Tech Stack:** Hono v4 backend, Drizzle ORM + postgres.js, node `fetch` for Telegram API calls, Vitest integration tests, React + Tailwind frontend.

---

## File Structure

**Create:**
- `packages/backend/src/lib/telegram.ts` — `TelegramClient` interface + `HttpTelegramClient` + `setTelegramClient`/`getTelegramClient`
- `packages/backend/src/routes/telegram.ts` — `PUT /auth/telegram`, `DELETE /auth/telegram`, `POST /telegram/webhook/:userId`
- `packages/backend/test/telegram.test.ts` — integration tests (mocked telegram client + LLM)
- `packages/backend/.env.example` — documents all env vars including `WEBHOOK_BASE_URL`
- `packages/frontend/src/hooks/useSettings.ts` — API calls for connect/disconnect
- `packages/frontend/src/pages/SettingsPage.tsx` — Telegram connect/disconnect form

**Modify:**
- `packages/backend/src/agent/context.ts` — add optional `channel` param to `saveMessage` (default `'web'`)
- `packages/backend/src/agent/engine.ts` — add optional `channel` param to `processMessage`; pass to `saveMessage`
- `packages/backend/src/routes/auth.ts` — add `telegramConnected: boolean` to `toSafeUser()`
- `packages/backend/test/auth.test.ts` — add assertion that `telegramConnected` is `false` for new user
- `packages/backend/src/index.ts` — import and mount `telegramRouter`
- `packages/frontend/src/stores/auth.ts` — add `telegramConnected?: boolean` to `User` type
- `packages/frontend/src/App.tsx` — add `/settings` protected route
- `packages/frontend/src/pages/ChatPage.tsx` — add "Pengaturan" link in header; add `Link` import

---

### Task 1: Telegram API Client Library

**Files:**
- Create: `packages/backend/src/lib/telegram.ts`

`TelegramClient` wraps four Telegram Bot API calls. `HttpTelegramClient` uses `fetch`; `setTelegramClient`/`getTelegramClient` enable injection in tests — same pattern as `setLlmProvider` in `src/lib/llm/index.ts`.

- [ ] **Step 1: Create the file**

```typescript
// packages/backend/src/lib/telegram.ts

export interface TelegramBotInfo {
  id: number
  username: string
  firstName: string
}

export interface TelegramClient {
  getMe(token: string): Promise<TelegramBotInfo>
  setWebhook(token: string, url: string): Promise<void>
  deleteWebhook(token: string): Promise<void>
  sendMessage(token: string, chatId: string, text: string): Promise<void>
}

class HttpTelegramClient implements TelegramClient {
  private async call(token: string, method: string, body?: object): Promise<unknown> {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    })
    const json = await res.json() as { ok: boolean; result?: unknown; description?: string }
    if (!json.ok) throw new Error(json.description ?? `Telegram API error on ${method}`)
    return json.result
  }

  async getMe(token: string): Promise<TelegramBotInfo> {
    const result = await this.call(token, 'getMe') as { id: number; username: string; first_name: string }
    return { id: result.id, username: result.username, firstName: result.first_name }
  }

  async setWebhook(token: string, url: string): Promise<void> {
    await this.call(token, 'setWebhook', { url })
  }

  async deleteWebhook(token: string): Promise<void> {
    await this.call(token, 'deleteWebhook')
  }

  async sendMessage(token: string, chatId: string, text: string): Promise<void> {
    await this.call(token, 'sendMessage', { chat_id: chatId, text })
  }
}

let client: TelegramClient = new HttpTelegramClient()

export function setTelegramClient(c: TelegramClient): void {
  client = c
}

export function getTelegramClient(): TelegramClient {
  return client
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd packages/backend && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/lib/telegram.ts
git commit -m "feat: add Telegram API client library with injectable interface"
```

---

### Task 2: Channel-Aware Message Saving

**Files:**
- Modify: `packages/backend/src/agent/context.ts`
- Modify: `packages/backend/src/agent/engine.ts`

`saveMessage` currently hardcodes `channel: 'web'`. Telegram messages should save with `channel: 'telegram'`. Add an optional `channel` param (default `'web'`) to both functions so all existing call sites continue to work without changes.

- [ ] **Step 1: Update `saveMessage` in `context.ts`**

Replace the function signature and insert statement. Old:

```typescript
export async function saveMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  await db.insert(conversationMessages).values({
    userId,
    channel: 'web',
    role,
    content,
  })
}
```

New:

```typescript
export async function saveMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  channel: 'web' | 'telegram' = 'web'
): Promise<void> {
  await db.insert(conversationMessages).values({
    userId,
    channel,
    role,
    content,
  })
}
```

- [ ] **Step 2: Update `processMessage` in `engine.ts`**

Change the function signature from:

```typescript
export async function processMessage(userId: string, message: string): Promise<string> {
```

to:

```typescript
export async function processMessage(
  userId: string,
  message: string,
  channel: 'web' | 'telegram' = 'web'
): Promise<string> {
```

And update the two `saveMessage` calls at the bottom of the function body from:

```typescript
  await saveMessage(userId, 'user', message)
  await saveMessage(userId, 'assistant', reply)
```

to:

```typescript
  await saveMessage(userId, 'user', message, channel)
  await saveMessage(userId, 'assistant', reply, channel)
```

- [ ] **Step 3: Run existing tests to confirm nothing broke**

```bash
cd packages/backend && pnpm test
```

Expected: all 56 tests pass. Default `'web'` keeps every existing call site working.

- [ ] **Step 4: Commit**

```bash
git add packages/backend/src/agent/context.ts packages/backend/src/agent/engine.ts
git commit -m "feat: add optional channel param to saveMessage and processMessage"
```

---

### Task 3: Telegram Setup and Disconnect Endpoints

**Files:**
- Create: `packages/backend/src/routes/telegram.ts`
- Create: `packages/backend/test/telegram.test.ts`
- Modify: `packages/backend/src/index.ts`

Endpoints:
- `PUT /auth/telegram` — accepts `{ botToken, telegramChatId }`, calls `getMe` to verify, registers webhook, saves to DB, returns `{ telegramConnected: true, botUsername }`.
- `DELETE /auth/telegram` — fetches stored token, calls `deleteWebhook`, clears DB fields, returns `{ telegramConnected: false }`.

Both require `authMiddleware`. The router is mounted at `/` in `index.ts` so full paths resolve correctly.

- [ ] **Step 1: Write the failing tests**

Create `packages/backend/test/telegram.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { app } from '../src/index'
import { db } from '../src/db'
import { users } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { signJwt } from '../src/lib/jwt'
import { setTelegramClient } from '../src/lib/telegram'
import { setLlmProvider } from '../src/lib/llm'
import { cleanDb, createTestUser } from './setup'
import type { TelegramClient } from '../src/lib/telegram'
import type { LlmProvider } from '../src/lib/llm/types'

const mockLlm: LlmProvider = {
  async chat() {
    return { content: 'Mock LLM reply', toolCalls: [] }
  },
}

function makeMockBot(): TelegramClient {
  return {
    getMe: vi.fn().mockResolvedValue({ id: 123456789, username: 'mytestbot', firstName: 'My Test Bot' }),
    setWebhook: vi.fn().mockResolvedValue(undefined),
    deleteWebhook: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue(undefined),
  }
}

let mockBot: TelegramClient

beforeEach(async () => {
  await cleanDb()
  mockBot = makeMockBot()
  setTelegramClient(mockBot)
  setLlmProvider(mockLlm)
})

async function createUserAndToken() {
  const user = await createTestUser()
  const token = await signJwt({ userId: user.id, email: user.email })
  return { user, token }
}

describe('PUT /auth/telegram', () => {
  it('returns 401 without auth token', async () => {
    const res = await app.request('/auth/telegram', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: 'bot123:ABC', telegramChatId: '987654321' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when botToken is missing', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/auth/telegram', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramChatId: '987654321' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when telegramChatId is missing', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/auth/telegram', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: 'bot123:ABC' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 422 when Telegram rejects the bot token', async () => {
    mockBot.getMe = vi.fn().mockRejectedValue(new Error('Unauthorized'))
    const { token } = await createUserAndToken()
    const res = await app.request('/auth/telegram', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: 'invalid:TOKEN', telegramChatId: '987654321' }),
    })
    expect(res.status).toBe(422)
  })

  it('stores bot token and chat id, calls getMe and setWebhook, returns connected status', async () => {
    const { token, user } = await createUserAndToken()
    const res = await app.request('/auth/telegram', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ botToken: 'bot123:ABC', telegramChatId: '987654321' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { telegramConnected: boolean; botUsername: string }
    expect(body.telegramConnected).toBe(true)
    expect(body.botUsername).toBe('mytestbot')
    expect(mockBot.getMe).toHaveBeenCalledWith('bot123:ABC')
    expect(mockBot.setWebhook).toHaveBeenCalledOnce()
    const [updated] = await db.select().from(users).where(eq(users.id, user.id))
    expect(updated.telegramBotToken).toBe('bot123:ABC')
    expect(updated.telegramUserId).toBe('987654321')
  })
})

describe('DELETE /auth/telegram', () => {
  it('returns 401 without auth token', async () => {
    const res = await app.request('/auth/telegram', { method: 'DELETE' })
    expect(res.status).toBe(401)
  })

  it('returns 400 when telegram is not connected', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/auth/telegram', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(400)
  })

  it('calls deleteWebhook, clears telegram fields, returns disconnected status', async () => {
    const { token, user } = await createUserAndToken()
    await db.update(users)
      .set({ telegramBotToken: 'bot123:ABC', telegramUserId: '987654321' })
      .where(eq(users.id, user.id))

    const res = await app.request('/auth/telegram', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { telegramConnected: boolean }
    expect(body.telegramConnected).toBe(false)
    expect(mockBot.deleteWebhook).toHaveBeenCalledWith('bot123:ABC')
    const [updated] = await db.select().from(users).where(eq(users.id, user.id))
    expect(updated.telegramBotToken).toBeNull()
    expect(updated.telegramUserId).toBeNull()
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd packages/backend && pnpm test test/telegram.test.ts
```

Expected: all 7 tests fail (routes not yet implemented).

- [ ] **Step 3: Create the router file**

Create `packages/backend/src/routes/telegram.ts`:

```typescript
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from '../db/schema'
import { authMiddleware } from '../middleware/auth'
import { getTelegramClient } from '../lib/telegram'

export const telegramRouter = new Hono()

telegramRouter.put('/auth/telegram', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json() as Record<string, unknown>
  const { botToken, telegramChatId } = body

  if (!botToken || typeof botToken !== 'string') {
    return c.json({ error: 'botToken harus diisi' }, 400)
  }
  if (!telegramChatId || typeof telegramChatId !== 'string') {
    return c.json({ error: 'telegramChatId harus diisi' }, 400)
  }

  const telegram = getTelegramClient()
  let botInfo: { username: string }
  try {
    botInfo = await telegram.getMe(botToken)
  } catch {
    return c.json({ error: 'Bot token tidak valid. Periksa kembali token dari BotFather.' }, 422)
  }

  const base = process.env.WEBHOOK_BASE_URL ?? ''
  try {
    await telegram.setWebhook(botToken, `${base}/telegram/webhook/${userId}`)
  } catch {
    return c.json({ error: 'Gagal mendaftarkan webhook ke Telegram.' }, 422)
  }

  await db.update(users)
    .set({ telegramBotToken: botToken, telegramUserId: telegramChatId })
    .where(eq(users.id, userId))

  return c.json({ telegramConnected: true, botUsername: botInfo.username })
})

telegramRouter.delete('/auth/telegram', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const [user] = await db
    .select({ telegramBotToken: users.telegramBotToken })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user?.telegramBotToken) {
    return c.json({ error: 'Telegram belum terhubung' }, 400)
  }

  const telegram = getTelegramClient()
  try {
    await telegram.deleteWebhook(user.telegramBotToken)
  } catch {
    // Ignore — still clear local data even if Telegram API call fails
  }

  await db.update(users)
    .set({ telegramBotToken: null, telegramUserId: null })
    .where(eq(users.id, userId))

  return c.json({ telegramConnected: false })
})
```

- [ ] **Step 4: Mount the router in `index.ts`**

Add import and `app.route('/', telegramRouter)` to `packages/backend/src/index.ts`:

```typescript
import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { authRouter } from './routes/auth'
import { chatRouter } from './routes/chat'
import { telegramRouter } from './routes/telegram'
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

app.get('/health', (c) => c.json({ ok: true }))

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT) || 3000
  serve({ fetch: app.fetch, port })
  console.log(`Backend running on http://localhost:${port}`)
}
```

- [ ] **Step 5: Run telegram tests — all should pass**

```bash
cd packages/backend && pnpm test test/telegram.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 6: Run full suite for regressions**

```bash
cd packages/backend && pnpm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/backend/src/routes/telegram.ts packages/backend/test/telegram.test.ts packages/backend/src/index.ts
git commit -m "feat: add Telegram setup and disconnect endpoints"
```

---

### Task 4: Telegram Webhook Handler

**Files:**
- Modify: `packages/backend/src/routes/telegram.ts` (add `POST /telegram/webhook/:userId` + `processMessage` import)
- Modify: `packages/backend/test/telegram.test.ts` (add webhook describe block)

The webhook endpoint has no JWT auth — Telegram calls it directly. Security is enforced by verifying the sender's `chat.id` matches the stored `telegramUserId`. The handler always returns 200; Telegram retries on non-200 responses.

- [ ] **Step 1: Add webhook tests to `telegram.test.ts`**

Append a new describe block at the end of the file:

```typescript
describe('POST /telegram/webhook/:userId', () => {
  function makeUpdate(chatId: number, text: string) {
    return {
      update_id: 1,
      message: {
        message_id: 1,
        from: { id: chatId },
        chat: { id: chatId },
        text,
        date: 1718000000,
      },
    }
  }

  it('returns 200 and ignores updates with no message or no text', async () => {
    const res = await app.request('/telegram/webhook/any-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_id: 1 }),
    })
    expect(res.status).toBe(200)
    expect(mockBot.sendMessage).not.toHaveBeenCalled()
  })

  it('returns 200 and does not call sendMessage for unknown userId', async () => {
    const res = await app.request('/telegram/webhook/nonexistent-user-id', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeUpdate(999999, 'halo')),
    })
    expect(res.status).toBe(200)
    expect(mockBot.sendMessage).not.toHaveBeenCalled()
  })

  it('returns 200 and does not call sendMessage when sender is not the registered telegram user', async () => {
    const user = await createTestUser()
    await db.update(users)
      .set({ telegramBotToken: 'bot123:ABC', telegramUserId: '987654321' })
      .where(eq(users.id, user.id))

    const res = await app.request(`/telegram/webhook/${user.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeUpdate(111111111, 'spoofed')),
    })
    expect(res.status).toBe(200)
    expect(mockBot.sendMessage).not.toHaveBeenCalled()
  })

  it('processes message from registered user and calls sendMessage with reply', async () => {
    const user = await createTestUser()
    await db.update(users)
      .set({ telegramBotToken: 'bot123:ABC', telegramUserId: '987654321' })
      .where(eq(users.id, user.id))

    const res = await app.request(`/telegram/webhook/${user.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeUpdate(987654321, 'halo dari telegram')),
    })

    expect(res.status).toBe(200)
    expect(mockBot.sendMessage).toHaveBeenCalledWith(
      'bot123:ABC',
      '987654321',
      expect.any(String)
    )
  })
})
```

- [ ] **Step 2: Run tests to confirm webhook tests fail**

```bash
cd packages/backend && pnpm test test/telegram.test.ts
```

Expected: 7 existing tests pass, 4 new webhook tests fail.

- [ ] **Step 3: Add the webhook handler to `telegram.ts`**

Add the `processMessage` import at the top of the file (after existing imports):

```typescript
import { processMessage } from '../agent/engine'
```

Then add the `TelegramUpdate` type and handler at the bottom of the file (after the DELETE route):

```typescript
interface TelegramUpdate {
  update_id: number
  message?: {
    from: { id: number }
    chat: { id: number }
    text?: string
  }
}

telegramRouter.post('/telegram/webhook/:userId', async (c) => {
  const userId = c.param('userId')
  const update = await c.req.json() as TelegramUpdate

  if (!update.message?.text) return c.json({ ok: true })

  const [user] = await db
    .select({ telegramBotToken: users.telegramBotToken, telegramUserId: users.telegramUserId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user?.telegramBotToken || !user?.telegramUserId) return c.json({ ok: true })

  if (String(update.message.chat.id) !== user.telegramUserId) return c.json({ ok: true })

  try {
    const reply = await processMessage(userId, update.message.text, 'telegram')
    await getTelegramClient().sendMessage(user.telegramBotToken, user.telegramUserId, reply)
  } catch {
    // Always return 200 — Telegram retries on non-200 responses
  }

  return c.json({ ok: true })
})
```

- [ ] **Step 4: Run all telegram tests — all should pass**

```bash
cd packages/backend && pnpm test test/telegram.test.ts
```

Expected: all 11 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
cd packages/backend && pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/routes/telegram.ts packages/backend/test/telegram.test.ts
git commit -m "feat: add Telegram webhook handler for incoming messages"
```

---

### Task 5: Expose `telegramConnected` in User Profile + Create `.env.example`

**Files:**
- Modify: `packages/backend/src/routes/auth.ts`
- Modify: `packages/backend/test/auth.test.ts`
- Modify: `packages/frontend/src/stores/auth.ts`
- Create: `packages/backend/.env.example`

`toSafeUser()` omits the raw `telegramBotToken` (sensitive). We add a derived `telegramConnected: boolean` so the frontend knows whether to show "Connect" or "Disconnect".

- [ ] **Step 1: Write the failing test**

Add to `packages/backend/test/auth.test.ts` inside the `POST /auth/register` describe block:

```typescript
  it('includes telegramConnected: false for newly registered user', async () => {
    const res = await post('/auth/register', {
      email: 'tg@example.com',
      password: 'password123',
      fullName: 'Citra',
      businessName: 'Toko Citra',
    })
    expect(res.status).toBe(201)
    const body = await res.json() as { user: { telegramConnected: boolean } }
    expect(body.user.telegramConnected).toBe(false)
  })
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd packages/backend && pnpm test test/auth.test.ts
```

Expected: new test fails — `telegramConnected` is `undefined`.

- [ ] **Step 3: Update `toSafeUser` in `auth.ts`**

Replace:

```typescript
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
```

with:

```typescript
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
    telegramConnected: !!user.telegramBotToken,
  }
}
```

- [ ] **Step 4: Run auth tests**

```bash
cd packages/backend && pnpm test test/auth.test.ts
```

Expected: all auth tests pass including the new one.

- [ ] **Step 5: Update `User` type in `packages/frontend/src/stores/auth.ts`**

Add `telegramConnected` to the interface:

```typescript
interface User {
  id: string
  email: string
  fullName: string
  businessName: string
  telegramConnected?: boolean
}
```

- [ ] **Step 6: Create `.env.example`**

```
# packages/backend/.env.example
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/adminai
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/adminai_test
REDIS_URL=redis://localhost:6379
PORT=3000

# Public base URL used when registering Telegram webhooks.
# Use ngrok for local development: ngrok http 3000
# Example: https://abc123.ngrok.io
WEBHOOK_BASE_URL=https://your-server.example.com
```

- [ ] **Step 7: Run full test suite**

```bash
cd packages/backend && pnpm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/routes/auth.ts packages/backend/test/auth.test.ts packages/backend/.env.example packages/frontend/src/stores/auth.ts
git commit -m "feat: expose telegramConnected flag in user profile and document env vars"
```

---

### Task 6: Frontend Settings Page

**Files:**
- Create: `packages/frontend/src/hooks/useSettings.ts`
- Create: `packages/frontend/src/pages/SettingsPage.tsx`
- Modify: `packages/frontend/src/App.tsx`
- Modify: `packages/frontend/src/pages/ChatPage.tsx`

A protected `/settings` route with a Telegram section. Not connected → connect form (bot token + chat ID). Connected → green status badge + disconnect button. Uses `apiFetch` and updates the auth store so `user.telegramConnected` stays in sync without a page reload.

- [ ] **Step 1: Create `useSettings` hook**

```typescript
// packages/frontend/src/hooks/useSettings.ts
import { useState } from 'react'
import { apiFetch } from '../lib/api'
import { useAuthStore } from '../stores/auth'

interface ConnectResult {
  telegramConnected: boolean
  botUsername: string
}

export function useSettings() {
  const setAuth = useAuthStore((s) => s.setAuth)
  const token = useAuthStore((s) => s.token)
  const user = useAuthStore((s) => s.user)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [botUsername, setBotUsername] = useState<string | null>(null)

  const connectTelegram = async (botToken: string, telegramChatId: string) => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<ConnectResult>('/auth/telegram', {
        method: 'PUT',
        body: JSON.stringify({ botToken, telegramChatId }),
      })
      setBotUsername(data.botUsername)
      if (user && token) setAuth(token, { ...user, telegramConnected: true })
    } catch (err: any) {
      setError(err.message ?? 'Gagal menghubungkan Telegram.')
    } finally {
      setLoading(false)
    }
  }

  const disconnectTelegram = async () => {
    setLoading(true)
    setError(null)
    try {
      await apiFetch('/auth/telegram', { method: 'DELETE' })
      setBotUsername(null)
      if (user && token) setAuth(token, { ...user, telegramConnected: false })
    } catch (err: any) {
      setError(err.message ?? 'Gagal memutus koneksi Telegram.')
    } finally {
      setLoading(false)
    }
  }

  return { loading, error, botUsername, connectTelegram, disconnectTelegram }
}
```

- [ ] **Step 2: Create `SettingsPage.tsx`**

```typescript
// packages/frontend/src/pages/SettingsPage.tsx
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { useSettings } from '../hooks/useSettings'

export function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const { loading, error, botUsername, connectTelegram, disconnectTelegram } = useSettings()
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    await connectTelegram(botToken.trim(), chatId.trim())
    setBotToken('')
    setChatId('')
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

      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Telegram</h2>
          <p className="text-sm text-gray-500 mb-4">
            Chat dengan AdminAI langsung dari Telegram menggunakan bot pribadi kamu.
          </p>

          {isConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
                Terhubung ke @{botUsername ?? 'bot kamu'}
              </p>
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
                  onChange={e => setBotToken(e.target.value)}
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
                  onChange={e => setChatId(e.target.value)}
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
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add `/settings` route in `App.tsx`**

Replace the entire file:

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth'
import { RegisterPage } from './pages/RegisterPage'
import { LoginPage } from './pages/LoginPage'
import { ChatPage } from './pages/ChatPage'
import { SettingsPage } from './pages/SettingsPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/chat" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
        <Route path="/settings" element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 4: Update `ChatPage.tsx` header**

Change the `import` line to add `Link`:

```typescript
import { useNavigate, Link } from 'react-router-dom'
```

Replace the single logout button in the header with a flex row containing both links:

```typescript
        <div className="flex items-center gap-4">
          <Link to="/settings" className="text-sm text-gray-500 hover:text-gray-700">
            Pengaturan
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Keluar
          </button>
        </div>
```

- [ ] **Step 5: TypeScript check on frontend**

```bash
cd packages/frontend && pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Run backend tests one final time**

```bash
cd packages/backend && pnpm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/frontend/src/hooks/useSettings.ts packages/frontend/src/pages/SettingsPage.tsx packages/frontend/src/App.tsx packages/frontend/src/pages/ChatPage.tsx
git commit -m "feat: add Settings page with Telegram connect and disconnect"
```

---

## Self-Review

**Spec coverage:**
- ✅ `TelegramClient` interface with injectable mock (same pattern as `LlmProvider`)
- ✅ `PUT /auth/telegram` — validates, calls getMe, registers webhook, saves to DB
- ✅ `DELETE /auth/telegram` — calls deleteWebhook, clears DB fields
- ✅ `POST /telegram/webhook/:userId` — verifies sender, routes through `processMessage`, sends reply
- ✅ Security: sender's `chat.id` must match stored `telegramUserId`
- ✅ Channel-aware saving (`channel: 'telegram'`) via optional param with `'web'` default
- ✅ `telegramConnected` flag in `toSafeUser()` (sensitive token never exposed)
- ✅ Frontend Settings page with connect form and disconnect button
- ✅ Auth store `User` type extended with `telegramConnected`
- ✅ `App.tsx` protected `/settings` route
- ✅ ChatPage header "Pengaturan" link
- ✅ `.env.example` with `WEBHOOK_BASE_URL`
- ✅ 11 new integration tests across setup/disconnect/webhook

**Placeholder scan:** No TBDs, no TODOs, no "add appropriate X" — every step has complete code.

**Type consistency:**
- `TelegramClient` defined in Task 1 → imported as type in Task 3 test (`import type { TelegramClient }`)
- `TelegramBotInfo.username` used in Task 3 route handler via `botInfo.username` ✅
- `saveMessage(userId, role, content, channel)` — signature updated in Task 2, called with `'telegram'` in Task 4 ✅
- `processMessage(userId, message, channel)` — signature updated in Task 2, called with `'telegram'` in Task 4 ✅
- `telegramConnected` added to `toSafeUser()` in Task 5, added to `User` type in Task 5 ✅
- `botUsername` from `ConnectResult` used in `useSettings` and rendered in `SettingsPage` ✅

---

## Notes for Plan 5+

Deferred from Plan 4:
- **Scheduled Reports (Plan 5):** `scheduledReports` table exists, Redis is already configured in `.env`. Needs BullMQ + cron job runner + report generation. Delivery via Telegram (uses `getTelegramClient()` from this plan).
- **Email OAuth (Plan 6):** `emailOauthToken` + `emailPollIntervalMinutes` columns exist. Needs Google OAuth2 flow + Gmail API polling + bank transfer email parsing.
- **Custom Tools (Plan 7):** `customTools` + `toolUsageLog` tables exist. Needs dynamic tool registration and LLM-driven tool definition.
