# AdminAI Agent Engine — Implementation Plan (Plan 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the AI agent engine and replace the ChatPage placeholder with a functional chatbox. By end of Plan 2, users can open the web app, type a message, and receive intelligent responses from the AdminAI agent. The first message triggers the onboarding welcome (Telegram + email offer). Subsequent messages go through the full LLM + tool-calling pipeline.

**Architecture:**
- LLM abstraction: `LlmProvider` interface backed by a Gemini adapter (swappable to OpenRouter in Plan 5)
- Agent engine: single `processMessage(userId, message)` entrypoint dispatching between onboarding state machine and tool-calling flow
- Conversation history: stored in `conversation_messages`, loaded as sliding window (last 20 messages) per request
- Tool registry: empty in Plan 2 — Plan 3 registers business tools
- API: `POST /chat` (auth-protected) → `{ reply: string }` (non-streaming; Plan 5 adds SSE)
- Frontend: regular fetch + render reply when received; empty state shows prompt to user

**Tech Stack additions:** `@google/generative-ai` (Gemini 2.0 Flash, free tier)

**Vite proxy already configured:** `apiFetch('/chat', ...)` → `fetch('/api/chat', ...)` → Vite rewrites to `http://localhost:3000/chat` ✓

---

## File Structure (new files only)

```
packages/backend/src/
  lib/llm/
    types.ts             — LlmMessage, LlmTool, LlmResponse, LlmProvider interface
    gemini.ts            — Gemini adapter implementing LlmProvider
    index.ts             — getLlmProvider() factory + setLlmProvider() for test injection
  agent/
    context.ts           — loadContext() / saveMessage() — conversation history
    onboarding.ts        — state machine: getOnboardingState(), setOnboardingStep(), buildOnboardingMessage()
    engine.ts            — processMessage() main entrypoint
    tools/
      types.ts           — Tool interface + ToolResult
      index.ts           — registry: registerTool() / getTool() / getAllTools()
  routes/
    chat.ts              — POST /chat
test/
  context.test.ts
  onboarding.test.ts
  engine.test.ts
  chat.test.ts

packages/frontend/src/
  hooks/
    useChat.ts           — messages state + send() + loading/error
  components/
    ChatMessage.tsx      — user/assistant message bubble
  pages/
    ChatPage.tsx         — REPLACE placeholder (modify existing)
```

---

## Task 1: Add Gemini SDK & env vars

**Files:**
- Modify: `packages/backend/package.json` (add dependency)
- Modify: `.env.example`

- [ ] **Step 1: Install `@google/generative-ai` in backend**

Run from `packages/backend/`:
```
pnpm add @google/generative-ai
```

- [ ] **Step 2: Update `.env.example` — add `GEMINI_API_KEY` line**

Final file:
```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/adminai
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/adminai_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-this-to-a-random-32-char-secret
PORT=3000
GEMINI_API_KEY=your-gemini-api-key-here
```

Get a free API key from: https://aistudio.google.com/apikey

**Note:** Tests use a mock LLM (injected via `setLlmProvider()`) — `GEMINI_API_KEY` does not need to be set in the test environment. Do NOT add it to `vitest.config.ts`.

---

## Task 2: LLM abstraction layer

**Files:**
- Create: `packages/backend/src/lib/llm/types.ts`
- Create: `packages/backend/src/lib/llm/gemini.ts`
- Create: `packages/backend/src/lib/llm/index.ts`

No tests for this task — the adapter is tested indirectly through the engine tests.

- [ ] **Step 1: Create `packages/backend/src/lib/llm/types.ts`**

```typescript
export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface LlmToolCall {
  name: string
  args: Record<string, unknown>
}

export interface LlmResponse {
  content: string | null
  toolCalls: LlmToolCall[]
}

export interface LlmProvider {
  chat(
    systemPrompt: string,
    history: LlmMessage[],
    message: string,
    tools?: LlmTool[]
  ): Promise<LlmResponse>
}
```

- [ ] **Step 2: Create `packages/backend/src/lib/llm/gemini.ts`**

```typescript
import { GoogleGenerativeAI, FunctionCallingMode } from '@google/generative-ai'
import type { LlmMessage, LlmTool, LlmResponse, LlmProvider } from './types'

export class GeminiProvider implements LlmProvider {
  private readonly client: GoogleGenerativeAI
  private readonly modelName: string

  constructor(apiKey: string, modelName = 'gemini-2.0-flash') {
    this.client = new GoogleGenerativeAI(apiKey)
    this.modelName = modelName
  }

  async chat(
    systemPrompt: string,
    history: LlmMessage[],
    message: string,
    tools: LlmTool[] = []
  ): Promise<LlmResponse> {
    type ModelConfig = Parameters<typeof this.client.getGenerativeModel>[0]
    const config: ModelConfig = {
      model: this.modelName,
      systemInstruction: systemPrompt,
    }

    if (tools.length > 0) {
      config.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters as any,
        })),
      }]
      config.toolConfig = {
        functionCallingConfig: { mode: FunctionCallingMode.AUTO },
      }
    }

    const model = this.client.getGenerativeModel(config)

    const chat = model.startChat({
      history: history.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
    })

    const result = await chat.sendMessage(message)
    const response = result.response
    const functionCalls = response.functionCalls() ?? []

    if (functionCalls.length > 0) {
      return {
        content: null,
        toolCalls: functionCalls.map(fc => ({
          name: fc.name,
          args: fc.args as Record<string, unknown>,
        })),
      }
    }

    return { content: response.text(), toolCalls: [] }
  }
}
```

- [ ] **Step 3: Create `packages/backend/src/lib/llm/index.ts`**

```typescript
import { GeminiProvider } from './gemini'
import type { LlmProvider } from './types'

let provider: LlmProvider | null = null

export function getLlmProvider(): LlmProvider {
  if (!provider) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
    provider = new GeminiProvider(apiKey)
  }
  return provider
}

// Used in tests to inject a mock provider
export function setLlmProvider(p: LlmProvider): void {
  provider = p
}
```

---

## Task 3: Conversation context manager + tests

**Files:**
- Create: `packages/backend/src/agent/context.ts`
- Create: `packages/backend/test/context.test.ts`

- [ ] **Step 1: Write failing tests first — `packages/backend/test/context.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db'
import { users } from '../src/db/schema'
import { loadContext, saveMessage } from '../src/agent/context'
import { cleanDb } from './setup'

async function createUser(suffix = Date.now().toString()) {
  const [user] = await db.insert(users).values({
    email: `ctx-${suffix}@test.com`,
    passwordHash: 'hash',
    fullName: 'Ctx User',
    businessName: 'Toko Ctx',
  }).returning()
  return user
}

beforeEach(() => cleanDb())

describe('loadContext', () => {
  it('returns empty array for user with no messages', async () => {
    const user = await createUser()
    const msgs = await loadContext(user.id)
    expect(msgs).toEqual([])
  })

  it('returns messages in chronological order', async () => {
    const user = await createUser()
    await saveMessage(user.id, 'user', 'pertanyaan pertama')
    await saveMessage(user.id, 'assistant', 'jawaban pertama')
    const msgs = await loadContext(user.id)
    expect(msgs).toHaveLength(2)
    expect(msgs[0].role).toBe('user')
    expect(msgs[0].content).toBe('pertanyaan pertama')
    expect(msgs[1].role).toBe('assistant')
  })

  it('returns at most 20 messages (sliding window of most recent)', async () => {
    const user = await createUser()
    for (let i = 0; i < 25; i++) {
      await saveMessage(user.id, 'user', `msg ${i}`)
    }
    const msgs = await loadContext(user.id)
    expect(msgs.length).toBe(20)
    // Most recent 20: msg 5 through msg 24
    expect(msgs[19].content).toBe('msg 24')
  })
})

describe('saveMessage', () => {
  it('persists user message', async () => {
    const user = await createUser()
    await saveMessage(user.id, 'user', 'hello')
    const msgs = await loadContext(user.id)
    expect(msgs[0].content).toBe('hello')
    expect(msgs[0].role).toBe('user')
  })

  it('persists assistant message', async () => {
    const user = await createUser()
    await saveMessage(user.id, 'assistant', 'Halo!')
    const msgs = await loadContext(user.id)
    expect(msgs[0].content).toBe('Halo!')
    expect(msgs[0].role).toBe('assistant')
  })
})
```

- [ ] **Step 2: Create `packages/backend/src/agent/context.ts`**

```typescript
import { db } from '../db'
import { conversationMessages } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import type { LlmMessage } from '../lib/llm/types'

const WINDOW_SIZE = 20

export async function loadContext(userId: string): Promise<LlmMessage[]> {
  const rows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.userId, userId))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(WINDOW_SIZE)

  return rows
    .reverse()
    .filter(r => r.role === 'user' || r.role === 'assistant')
    .map(r => ({
      role: r.role as 'user' | 'assistant',
      content: r.content ?? '',
    }))
}

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

- [ ] **Step 3: Run tests** — `pnpm test` from `packages/backend`, all context tests should pass.

---

## Task 4: Onboarding state machine + tests

**Files:**
- Create: `packages/backend/src/agent/onboarding.ts`
- Create: `packages/backend/test/onboarding.test.ts`

- [ ] **Step 1: Write failing tests first — `packages/backend/test/onboarding.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db'
import { users } from '../src/db/schema'
import {
  getOnboardingState,
  setOnboardingStep,
  buildOnboardingMessage,
} from '../src/agent/onboarding'
import { cleanDb } from './setup'

async function createUser(suffix = Date.now().toString()) {
  const [user] = await db.insert(users).values({
    email: `onb-${suffix}@test.com`,
    passwordHash: 'hash',
    fullName: 'Onb User',
    businessName: 'Toko Onb',
  }).returning()
  return user
}

beforeEach(() => cleanDb())

describe('getOnboardingState', () => {
  it('returns OFFER_INTEGRATIONS for new user (null state)', async () => {
    const user = await createUser()
    const state = await getOnboardingState(user.id)
    expect(state.step).toBe('OFFER_INTEGRATIONS')
  })

  it('returns persisted step after setOnboardingStep', async () => {
    const user = await createUser()
    await setOnboardingStep(user.id, 'ACTIVE')
    const state = await getOnboardingState(user.id)
    expect(state.step).toBe('ACTIVE')
  })
})

describe('buildOnboardingMessage', () => {
  it('includes user fullName and businessName', () => {
    const msg = buildOnboardingMessage('Budi', 'Warung Budi')
    expect(msg).toContain('Budi')
    expect(msg).toContain('Warung Budi')
  })

  it('mentions both Telegram and email integration options', () => {
    const msg = buildOnboardingMessage('Siti', 'Toko Siti')
    expect(msg.toLowerCase()).toContain('telegram')
    expect(msg.toLowerCase()).toContain('email')
  })
})
```

- [ ] **Step 2: Create `packages/backend/src/agent/onboarding.ts`**

```typescript
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'

export interface OnboardingState {
  step: 'OFFER_INTEGRATIONS' | 'ACTIVE'
}

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const [user] = await db
    .select({ onboardingState: users.onboardingState })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user?.onboardingState) return { step: 'OFFER_INTEGRATIONS' }
  return user.onboardingState as OnboardingState
}

export async function setOnboardingStep(
  userId: string,
  step: OnboardingState['step']
): Promise<void> {
  await db
    .update(users)
    .set({ onboardingState: { step } })
    .where(eq(users.id, userId))
}

export function buildOnboardingMessage(fullName: string, businessName: string): string {
  return `Halo, ${fullName}! Selamat datang di AdminAI.

Saya siap membantu kamu mengelola keuangan dan invoice untuk **${businessName}**.

Sebelum mulai, ada 2 hal yang bisa membuat pengalamanmu lebih lengkap:

📱 **Telegram** — Akses saya langsung dari HP, terima notifikasi invoice dan laporan otomatis kapan saja. Ketik "setup telegram" untuk memulai.

📧 **Email** — Saya bisa otomatis mendeteksi notifikasi transfer masuk dan invoice dari supplier. Ketik "connect email" untuk memulai.

Atau langsung mulai saja — ketik apa yang ingin kamu catat atau tanyakan seputar keuangan ${businessName}!`
}
```

- [ ] **Step 3: Run tests** — all onboarding tests should pass.

---

## Task 5: Tool registry scaffold

**Files:**
- Create: `packages/backend/src/agent/tools/types.ts`
- Create: `packages/backend/src/agent/tools/index.ts`

No tests — registry is empty in Plan 2. Plan 3 registers tools and covers them with tests.

- [ ] **Step 1: Create `packages/backend/src/agent/tools/types.ts`**

```typescript
export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface Tool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, userId: string): Promise<ToolResult>
}
```

- [ ] **Step 2: Create `packages/backend/src/agent/tools/index.ts`**

```typescript
import type { Tool } from './types'

const registry = new Map<string, Tool>()

export function registerTool(tool: Tool): void {
  registry.set(tool.name, tool)
}

export function getTool(name: string): Tool | undefined {
  return registry.get(name)
}

export function getAllTools(): Tool[] {
  return Array.from(registry.values())
}
```

---

## Task 6: Agent engine + tests

**Files:**
- Create: `packages/backend/src/agent/engine.ts`
- Create: `packages/backend/test/engine.test.ts`

Flow for `processMessage(userId, message)`:
1. Fetch user row (fullName, businessName)
2. Check `onboardingState`
   - If `OFFER_INTEGRATIONS`: return onboarding welcome message, set step to `ACTIVE`
   - If `ACTIVE`: load history → call LLM → handle tool calls or text response
3. Save user message + assistant reply to `conversation_messages`
4. Return reply string

For tool calls: execute tool, re-query LLM with result for natural-language reply. In Plan 2 no tools are registered, so this path is never exercised.

- [ ] **Step 1: Write failing tests — `packages/backend/test/engine.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db'
import { users, conversationMessages } from '../src/db/schema'
import { eq } from 'drizzle-orm'
import { processMessage } from '../src/agent/engine'
import { setLlmProvider } from '../src/lib/llm'
import { cleanDb } from './setup'
import type { LlmProvider } from '../src/lib/llm/types'

const mockLlm: LlmProvider = {
  async chat() {
    return { content: 'Mock response dari LLM', toolCalls: [] }
  },
}

async function createUser(suffix = Date.now().toString()) {
  const [user] = await db.insert(users).values({
    email: `eng-${suffix}@test.com`,
    passwordHash: 'hash',
    fullName: 'Engine User',
    businessName: 'Toko Engine',
  }).returning()
  return user
}

beforeEach(async () => {
  await cleanDb()
  setLlmProvider(mockLlm)
})

describe('processMessage', () => {
  it('returns onboarding message on first ever message', async () => {
    const user = await createUser()
    const reply = await processMessage(user.id, 'halo')
    expect(reply).toContain('Selamat datang')
    expect(reply).toContain('Toko Engine')
    expect(reply).toContain('Telegram')
  })

  it('calls LLM for messages after onboarding completes', async () => {
    const user = await createUser()
    await processMessage(user.id, 'halo') // triggers onboarding → sets ACTIVE
    const reply = await processMessage(user.id, 'apa yang bisa kamu bantu?')
    expect(reply).toBe('Mock response dari LLM')
  })

  it('saves both user and assistant messages to conversation_messages', async () => {
    const user = await createUser()
    await processMessage(user.id, 'halo')
    const msgs = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.userId, user.id))
    expect(msgs.some(m => m.role === 'user')).toBe(true)
    expect(msgs.some(m => m.role === 'assistant')).toBe(true)
  })

  it('passes accumulated conversation history to LLM', async () => {
    let capturedHistoryLength = 0
    const spyLlm: LlmProvider = {
      async chat(_, history) {
        capturedHistoryLength = history.length
        return { content: 'ok', toolCalls: [] }
      },
    }
    setLlmProvider(spyLlm)

    const user = await createUser()
    await processMessage(user.id, 'pesan pertama') // onboarding
    await processMessage(user.id, 'pesan kedua')   // LLM, history = [pesan1, onboarding-reply]
    await processMessage(user.id, 'pesan ketiga')  // LLM, history = [pesan1, onboarding-reply, pesan2, llm-reply]

    expect(capturedHistoryLength).toBeGreaterThanOrEqual(4)
  })
})
```

- [ ] **Step 2: Create `packages/backend/src/agent/engine.ts`**

```typescript
import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getLlmProvider } from '../lib/llm'
import { loadContext, saveMessage } from './context'
import { getOnboardingState, setOnboardingStep, buildOnboardingMessage } from './onboarding'
import { getAllTools, getTool } from './tools'

function buildSystemPrompt(fullName: string, businessName: string): string {
  return `Kamu adalah AdminAI, asisten AI untuk usaha kecil.
Pengguna: ${fullName} | Bisnis: ${businessName}
Tugasmu: membantu mengelola keuangan dan invoice melalui percakapan.
Jawab dalam Bahasa Indonesia yang santai dan ramah.
Jika diminta fitur yang belum tersedia, beritahu bahwa sedang dikembangkan.`.trim()
}

export async function processMessage(userId: string, message: string): Promise<string> {
  const [user] = await db
    .select({ fullName: users.fullName, businessName: users.businessName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) throw new Error('User not found')

  const onboarding = await getOnboardingState(userId)

  let reply: string

  if (onboarding.step === 'OFFER_INTEGRATIONS') {
    reply = buildOnboardingMessage(user.fullName, user.businessName)
    await setOnboardingStep(userId, 'ACTIVE')
  } else {
    const history = await loadContext(userId)
    const tools = getAllTools()
    const llm = getLlmProvider()
    const systemPrompt = buildSystemPrompt(user.fullName, user.businessName)

    const response = await llm.chat(
      systemPrompt,
      history,
      message,
      tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }))
    )

    if (response.toolCalls.length > 0) {
      const tc = response.toolCalls[0]
      const tool = getTool(tc.name)

      if (!tool) {
        reply = 'Maaf, fitur tersebut belum tersedia saat ini.'
      } else {
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
      }
    } else {
      reply = response.content ?? 'Maaf, tidak ada respons.'
    }
  }

  await saveMessage(userId, 'user', message)
  await saveMessage(userId, 'assistant', reply)

  return reply
}
```

- [ ] **Step 3: Run tests** — all engine tests should pass.

---

## Task 7: Chat API route + tests

**Files:**
- Create: `packages/backend/src/routes/chat.ts`
- Modify: `packages/backend/src/index.ts` (register router)
- Create: `packages/backend/test/chat.test.ts`

- [ ] **Step 1: Write failing tests — `packages/backend/test/chat.test.ts`**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '../src/db'
import { users } from '../src/db/schema'
import { app } from '../src/index'
import { signJwt } from '../src/lib/jwt'
import { setLlmProvider } from '../src/lib/llm'
import { cleanDb } from './setup'
import type { LlmProvider } from '../src/lib/llm/types'

const mockLlm: LlmProvider = {
  async chat() {
    return { content: 'Respons dari agent', toolCalls: [] }
  },
}

async function createUserAndToken(suffix = Date.now().toString()) {
  const [user] = await db.insert(users).values({
    email: `chat-${suffix}@test.com`,
    passwordHash: 'hash',
    fullName: 'Chat User',
    businessName: 'Toko Chat',
  }).returning()
  const token = await signJwt({ userId: user.id, email: user.email })
  return { user, token }
}

beforeEach(async () => {
  await cleanDb()
  setLlmProvider(mockLlm)
})

describe('POST /chat', () => {
  it('returns onboarding reply for first message of a new user', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'halo' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { reply: string }
    expect(body.reply).toContain('Selamat datang')
  })

  it('returns LLM reply for subsequent messages', async () => {
    const { token } = await createUserAndToken()
    // First message triggers onboarding
    await app.request('/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'halo' }),
    })
    // Second message goes through LLM
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'apa yang bisa kamu bantu?' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { reply: string }
    expect(body.reply).toBe('Respons dari agent')
  })

  it('returns 401 without Authorization header', async () => {
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'halo' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when message field is missing', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when message is an empty string', async () => {
    const { token } = await createUserAndToken()
    const res = await app.request('/chat', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    })
    expect(res.status).toBe(400)
  })
})
```

- [ ] **Step 2: Create `packages/backend/src/routes/chat.ts`**

```typescript
import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth'
import { processMessage } from '../agent/engine'

export const chatRouter = new Hono()

chatRouter.post('/', authMiddleware, async (c) => {
  const body = await c.req.json()
  const { message } = body

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return c.json({ error: 'Message is required' }, 400)
  }

  const userId = c.get('userId')
  const reply = await processMessage(userId, message.trim())

  return c.json({ reply })
})
```

- [ ] **Step 3: Register chat router in `packages/backend/src/index.ts`**

```typescript
import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { authRouter } from './routes/auth'
import { chatRouter } from './routes/chat'

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

- [ ] **Step 4: Run all backend tests** — `pnpm test` in `packages/backend`. All 5 test files should pass (auth, context, onboarding, engine, chat). No regressions in auth.

---

## Task 8: Frontend chat hook + ChatMessage component

**Files:**
- Create: `packages/frontend/src/hooks/useChat.ts`
- Create: `packages/frontend/src/components/ChatMessage.tsx`

- [ ] **Step 1: Create `packages/frontend/src/hooks/useChat.ts`**

```typescript
import { useState, useCallback } from 'react'
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

- [ ] **Step 2: Create `packages/frontend/src/components/ChatMessage.tsx`**

```tsx
interface Props {
  role: 'user' | 'assistant'
  content: string
}

export function ChatMessage({ role, content }: Props) {
  const isUser = role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white text-gray-800 rounded-bl-sm shadow-sm border border-gray-100'
        }`}
      >
        {content}
      </div>
    </div>
  )
}
```

---

## Task 9: Replace ChatPage placeholder

**Files:**
- Modify: `packages/frontend/src/pages/ChatPage.tsx`

The empty-state placeholder shows when no messages have been exchanged yet. Once the user sends their first message, the backend responds with the onboarding welcome message.

- [ ] **Step 1: Replace `packages/frontend/src/pages/ChatPage.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { useChat } from '../hooks/useChat'
import { ChatMessage } from '../components/ChatMessage'

export function ChatPage() {
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const navigate = useNavigate()
  const { messages, loading, error, send } = useChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    send(input)
    setInput('')
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="font-semibold text-gray-900">AdminAI</h1>
          <p className="text-xs text-gray-500">{user?.businessName}</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Keluar
        </button>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center text-gray-400 mt-20">
              <p className="text-lg font-medium">Halo, {user?.fullName}!</p>
              <p className="text-sm mt-1">Ketik pesan untuk mulai berbicara dengan AdminAI.</p>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100">
              <span className="flex gap-1 items-center h-4">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-center text-sm text-red-500">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-200 px-4 py-4 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-2xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ketik pesan..."
            disabled={loading}
            className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="bg-blue-600 text-white rounded-full px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Kirim
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Start both servers and verify in browser**

```bash
# Terminal 1 — backend (ensure GEMINI_API_KEY is in .env)
cd packages/backend && pnpm dev

# Terminal 2 — frontend
cd packages/frontend && pnpm dev
```

Open `http://localhost:5173`, register or login, and verify:
1. Chat page loads with header showing business name and "Keluar" button
2. Empty state shows greeting prompt
3. Typing a message and submitting shows user bubble → typing indicator → agent reply
4. First message triggers onboarding welcome with Telegram + email offer
5. Subsequent messages get intelligent LLM responses
6. Logout redirects to `/login`

---

## Pre-Task Checklist

Before starting:
- [ ] `pnpm test` in `packages/backend` passes all 8 existing auth tests
- [ ] PostgreSQL is running and `adminai_test` database is accessible
- [ ] Gemini API key obtained from https://aistudio.google.com/apikey
- [ ] `.env` file in project root has `GEMINI_API_KEY=<your-key>` (NOT in `.env.example`)

## Completion Criteria

- [ ] All 5 backend test files pass: `auth.test.ts`, `context.test.ts`, `onboarding.test.ts`, `engine.test.ts`, `chat.test.ts`
- [ ] No regressions — all 8 existing auth tests still pass
- [ ] Web chatbox is functional end-to-end with real Gemini responses

## Notes for Plan 3

- `agent/tools/index.ts` registry is empty — Plan 3 registers `create_transaction`, `get_balance`, `list_transactions`, `create_invoice`, `list_invoices`, `mark_invoice_paid`
- Plan 3 should also add `GET /chat/history` to load existing conversation on chat page refresh
- Before Plan 3: fix auth responses — replace spread `{ ...safeUser }` with explicit allowlist to avoid accidentally exposing `telegramBotToken` and `emailOauthToken`
