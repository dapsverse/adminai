# AdminAI Foundation — Implementation Plan (Plan 1 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the monorepo with a working Hono backend (auth API + PostgreSQL), React/Vite frontend (register/login/chat placeholder), and all dev tooling wired up.

**Architecture:** pnpm workspace monorepo with `packages/backend` (Hono + Drizzle + PostgreSQL) and `packages/frontend` (React + Vite + Zustand). Auth uses JWT (jose) with bcrypt password hashing. The full DB schema is defined upfront so later plans only add logic, not schema changes.

**Tech Stack:** Hono 4, Drizzle ORM, PostgreSQL, Redis (via docker-compose), React 18, React Router 6, Zustand, Tailwind CSS, Vitest, TypeScript, pnpm workspaces.

---

## File Structure

```
adminai/
├── packages/
│   ├── backend/
│   │   ├── src/
│   │   │   ├── index.ts                  — Hono app + server entry
│   │   │   ├── db/
│   │   │   │   ├── schema.ts             — full Drizzle schema (all tables)
│   │   │   │   └── index.ts              — DB connection singleton
│   │   │   ├── routes/
│   │   │   │   └── auth.ts               — POST /auth/register, /auth/login, /auth/me
│   │   │   ├── middleware/
│   │   │   │   └── auth.ts               — JWT bearer verification middleware
│   │   │   └── lib/
│   │   │       ├── jwt.ts                — sign/verify JWT helpers
│   │   │       └── crypto.ts             — bcrypt hash/compare helpers
│   │   ├── test/
│   │   │   ├── setup.ts                  — DB cleanup helpers
│   │   │   └── auth.test.ts              — auth route tests
│   │   ├── drizzle.config.ts
│   │   ├── vitest.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx                   — router setup
│       │   ├── pages/
│       │   │   ├── RegisterPage.tsx
│       │   │   ├── LoginPage.tsx
│       │   │   └── ChatPage.tsx          — placeholder (Plan 2 fills this)
│       │   ├── lib/
│       │   │   └── api.ts                — fetch wrapper with auth header
│       │   └── stores/
│       │       └── auth.ts               — Zustand auth store (token + user)
│       ├── index.html
│       ├── package.json
│       ├── vite.config.ts
│       └── tsconfig.json
├── package.json                          — pnpm workspace root
├── docker-compose.yml                    — PostgreSQL + Redis
└── .env.example
```

---

## Task 1: Monorepo & Docker Setup

**Files:**
- Create: `package.json` (root)
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `packages/backend/package.json`
- Create: `packages/backend/tsconfig.json`
- Create: `packages/frontend/package.json`
- Create: `packages/frontend/tsconfig.json`

- [ ] **Step 1: Create root workspace package.json**

```json
{
  "name": "adminai",
  "private": true,
  "packageManager": "pnpm@9.0.0",
  "workspaces": ["packages/*"],
  "scripts": {
    "dev:backend": "pnpm --filter backend dev",
    "dev:frontend": "pnpm --filter frontend dev",
    "test": "pnpm --filter backend test"
  }
}
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: adminai
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  postgres_test:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: adminai_test
    ports:
      - "5433:5432"

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

- [ ] **Step 3: Create .env.example**

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/adminai
DATABASE_URL_TEST=postgresql://postgres:postgres@localhost:5433/adminai_test
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-this-to-a-random-32-char-secret
PORT=3000
```

- [ ] **Step 4: Create packages/backend/package.json**

```json
{
  "name": "backend",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:migrate:test": "DATABASE_URL=$DATABASE_URL_TEST tsx src/db/migrate.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.13",
    "@paralleldrive/cuid2": "^2.2",
    "bcrypt": "^5.1",
    "dotenv": "^16.4",
    "drizzle-orm": "^0.38",
    "hono": "^4.6",
    "jose": "^5.9",
    "postgres": "^3.4"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0",
    "@types/node": "^22",
    "drizzle-kit": "^0.30",
    "tsx": "^4.19",
    "typescript": "^5.7",
    "vitest": "^2.1"
  }
}
```

- [ ] **Step 5: Create packages/backend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 6: Create packages/frontend/package.json**

```json
{
  "name": "frontend",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3",
    "react-dom": "^18.3",
    "react-router-dom": "^6.28",
    "zustand": "^5.0"
  },
  "devDependencies": {
    "@types/react": "^18.3",
    "@types/react-dom": "^18.3",
    "@vitejs/plugin-react": "^4.3",
    "autoprefixer": "^10.4",
    "postcss": "^8.4",
    "tailwindcss": "^3.4",
    "typescript": "^5.7",
    "vite": "^6.0"
  }
}
```

- [ ] **Step 7: Create packages/frontend/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 8: Install dependencies**

```bash
pnpm install
```

Expected: packages installed in both workspaces, no errors.

- [ ] **Step 9: Start Docker services**

```bash
docker compose up -d
```

Expected: postgres, postgres_test, and redis containers running.

- [ ] **Step 10: Copy .env.example to .env in backend**

```bash
cp .env.example packages/backend/.env
```

- [ ] **Step 11: Commit**

```bash
git init
git add .
git commit -m "chore: initialize pnpm monorepo with backend and frontend packages"
```

---

## Task 2: Database Schema + Migrations

**Files:**
- Create: `packages/backend/src/db/schema.ts`
- Create: `packages/backend/src/db/index.ts`
- Create: `packages/backend/src/db/migrate.ts`
- Create: `packages/backend/drizzle.config.ts`

- [ ] **Step 1: Create packages/backend/src/db/schema.ts**

```typescript
import {
  pgTable, pgEnum, text, integer, bigint,
  timestamp, jsonb, boolean,
} from 'drizzle-orm/pg-core'
import { createId } from '@paralleldrive/cuid2'

export const userTierEnum = pgEnum('user_tier', ['free', 'premium'])
export const transactionTypeEnum = pgEnum('transaction_type', ['income', 'expense'])
export const transactionSourceEnum = pgEnum('transaction_source', ['manual', 'email_parsed', 'agent'])
export const invoiceDirectionEnum = pgEnum('invoice_direction', ['outgoing', 'incoming'])
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'overdue', 'received'])
export const channelEnum = pgEnum('channel', ['web', 'telegram'])
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'tool'])
export const reportTypeEnum = pgEnum('report_type', ['daily', 'weekly', 'monthly', 'custom'])
export const reportDeliveryEnum = pgEnum('report_delivery', ['telegram', 'email', 'both'])
export const toolStatusEnum = pgEnum('tool_status', ['temporary', 'permanent'])

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  businessName: text('business_name').notNull(),
  invoiceSenderName: text('invoice_sender_name'),
  telegramBotToken: text('telegram_bot_token'),
  telegramUserId: text('telegram_user_id'),
  emailOauthToken: text('email_oauth_token'),
  emailPollIntervalMinutes: integer('email_poll_interval_minutes').default(60).notNull(),
  onboardingState: jsonb('onboarding_state'),
  tier: userTierEnum('tier').default('free').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: transactionTypeEnum('type').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  currency: text('currency').default('IDR').notNull(),
  category: text('category'),
  description: text('description'),
  source: transactionSourceEnum('source').default('manual').notNull(),
  date: timestamp('date').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  direction: invoiceDirectionEnum('direction').notNull(),
  invoiceNumber: text('invoice_number').notNull(),
  clientName: text('client_name').notNull(),
  clientEmail: text('client_email'),
  items: jsonb('items').notNull().$type<Array<{ description: string; qty: number; price: number }>>(),
  totalAmount: bigint('total_amount', { mode: 'number' }).notNull(),
  status: invoiceStatusEnum('status').notNull(),
  dueDate: timestamp('due_date'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const conversationMessages = pgTable('conversation_messages', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channel: channelEnum('channel').notNull(),
  role: messageRoleEnum('role').notNull(),
  content: text('content'),
  toolCalls: jsonb('tool_calls'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const scheduledReports = pgTable('scheduled_reports', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: reportTypeEnum('type').notNull(),
  cronExpression: text('cron_expression').notNull(),
  delivery: reportDeliveryEnum('delivery').notNull(),
  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
})

export const customTools = pgTable('custom_tools', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  description: text('description').notNull(),
  definition: jsonb('definition').notNull().$type<{ steps: Array<{ tool: string; params: Record<string, unknown> }> }>(),
  status: toolStatusEnum('status').default('temporary').notNull(),
  creatorUserId: text('creator_user_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const toolUsageLog = pgTable('tool_usage_log', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  toolId: text('tool_id').notNull().references(() => customTools.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  usedAt: timestamp('used_at').defaultNow().notNull(),
})
```

- [ ] **Step 2: Create packages/backend/src/db/index.ts**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL!

const client = postgres(connectionString, { max: 10 })
export const db = drizzle(client, { schema })
```

- [ ] **Step 3: Create packages/backend/src/db/migrate.ts**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import postgres from 'postgres'
import path from 'path'

const connectionString = process.env.DATABASE_URL!
const client = postgres(connectionString, { max: 1 })
const db = drizzle(client)

await migrate(db, { migrationsFolder: path.join(import.meta.dirname, '../../drizzle') })
await client.end()
console.log('Migration complete')
```

- [ ] **Step 4: Create packages/backend/drizzle.config.ts**

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config
```

- [ ] **Step 5: Generate migration**

```bash
cd packages/backend && pnpm db:generate
```

Expected: `drizzle/` folder created with SQL migration files.

- [ ] **Step 6: Run migration on dev DB**

```bash
cd packages/backend && pnpm db:migrate
```

Expected: `Migration complete` — all tables created in `adminai` DB.

- [ ] **Step 7: Run migration on test DB**

```bash
cd packages/backend && pnpm db:migrate:test
```

Expected: `Migration complete` — all tables created in `adminai_test` DB.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/db packages/backend/drizzle packages/backend/drizzle.config.ts
git commit -m "feat: add full database schema with Drizzle ORM"
```

---

## Task 3: JWT & Crypto Helpers

**Files:**
- Create: `packages/backend/src/lib/jwt.ts`
- Create: `packages/backend/src/lib/crypto.ts`

- [ ] **Step 1: Create packages/backend/src/lib/jwt.ts**

```typescript
import { SignJWT, jwtVerify } from 'jose'

const secret = new TextEncoder().encode(process.env.JWT_SECRET!)

export interface JwtPayload {
  userId: string
  email: string
}

export async function signJwt(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .sign(secret)
}

export async function verifyJwt(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, secret)
  return payload as unknown as JwtPayload
}
```

- [ ] **Step 2: Create packages/backend/src/lib/crypto.ts**

```typescript
import bcrypt from 'bcrypt'

const ROUNDS = 12

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/backend/src/lib
git commit -m "feat: add JWT sign/verify and bcrypt helpers"
```

---

## Task 4: Auth API (Register + Login + Me)

**Files:**
- Create: `packages/backend/src/routes/auth.ts`
- Create: `packages/backend/src/middleware/auth.ts`
- Create: `packages/backend/src/index.ts`
- Create: `packages/backend/vitest.config.ts`
- Create: `packages/backend/test/setup.ts`
- Create: `packages/backend/test/auth.test.ts`

- [ ] **Step 1: Write failing tests — packages/backend/test/auth.test.ts**

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { app } from '../src/index'
import { cleanDb } from './setup'

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

beforeEach(async () => {
  await cleanDb()
})

describe('POST /auth/register', () => {
  it('creates user and returns token + user', async () => {
    const res = await post('/auth/register', {
      email: 'test@example.com',
      password: 'password123',
      fullName: 'Budi Santoso',
      businessName: 'Toko Makmur',
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.token).toBeTypeOf('string')
    expect(body.user.email).toBe('test@example.com')
    expect(body.user.passwordHash).toBeUndefined()
  })

  it('returns 409 if email already registered', async () => {
    await post('/auth/register', {
      email: 'dupe@example.com',
      password: 'password123',
      fullName: 'Ani',
      businessName: 'Warung Ani',
    })
    const res = await post('/auth/register', {
      email: 'dupe@example.com',
      password: 'password123',
      fullName: 'Ani',
      businessName: 'Warung Ani',
    })
    expect(res.status).toBe(409)
  })

  it('returns 400 if required fields missing', async () => {
    const res = await post('/auth/register', { email: 'bad@example.com' })
    expect(res.status).toBe(400)
  })
})

describe('POST /auth/login', () => {
  beforeEach(async () => {
    await post('/auth/register', {
      email: 'login@example.com',
      password: 'correctpassword',
      fullName: 'Login User',
      businessName: 'Biz',
    })
  })

  it('returns token for valid credentials', async () => {
    const res = await post('/auth/login', {
      email: 'login@example.com',
      password: 'correctpassword',
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.token).toBeTypeOf('string')
    expect(body.user.email).toBe('login@example.com')
  })

  it('returns 401 for wrong password', async () => {
    const res = await post('/auth/login', {
      email: 'login@example.com',
      password: 'wrongpassword',
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 for unknown email', async () => {
    const res = await post('/auth/login', {
      email: 'nobody@example.com',
      password: 'password',
    })
    expect(res.status).toBe(401)
  })
})

describe('GET /auth/me', () => {
  it('returns user for valid token', async () => {
    const reg = await post('/auth/register', {
      email: 'me@example.com',
      password: 'password123',
      fullName: 'Me User',
      businessName: 'My Biz',
    })
    const { token } = await reg.json()

    const res = await app.request('/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.email).toBe('me@example.com')
  })

  it('returns 401 without token', async () => {
    const res = await app.request('/auth/me')
    expect(res.status).toBe(401)
  })
})
```

- [ ] **Step 2: Create packages/backend/test/setup.ts**

```typescript
import 'dotenv/config'
import { db } from '../src/db'
import {
  toolUsageLog, customTools, scheduledReports,
  conversationMessages, invoices, transactions, users,
} from '../src/db/schema'

export async function cleanDb() {
  await db.delete(toolUsageLog)
  await db.delete(customTools)
  await db.delete(scheduledReports)
  await db.delete(conversationMessages)
  await db.delete(invoices)
  await db.delete(transactions)
  await db.delete(users)
}
```

- [ ] **Step 3: Create packages/backend/vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5433/adminai_test',
      JWT_SECRET: 'test-secret-minimum-32-chars-long!!',
    },
    setupFiles: [],
    pool: 'forks',
  },
})
```

- [ ] **Step 4: Run tests — expect them to fail**

```bash
cd packages/backend && pnpm test
```

Expected: FAIL — `app` not defined yet.

- [ ] **Step 5: Create packages/backend/src/middleware/auth.ts**

```typescript
import { createMiddleware } from 'hono/factory'
import { verifyJwt } from '../lib/jwt'

export const authMiddleware = createMiddleware<{
  Variables: { userId: string; email: string }
}>(async (c, next) => {
  const header = c.req.header('Authorization')
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }
  try {
    const payload = await verifyJwt(header.slice(7))
    c.set('userId', payload.userId)
    c.set('email', payload.email)
    await next()
  } catch {
    return c.json({ error: 'Unauthorized' }, 401)
  }
})
```

- [ ] **Step 6: Create packages/backend/src/routes/auth.ts**

```typescript
import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { db } from '../db'
import { users } from '../db/schema'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { signJwt } from '../lib/jwt'
import { authMiddleware } from '../middleware/auth'

export const authRouter = new Hono()

authRouter.post('/register', async (c) => {
  const body = await c.req.json()
  const { email, password, fullName, businessName } = body

  if (!email || !password || !fullName || !businessName) {
    return c.json({ error: 'Missing required fields' }, 400)
  }

  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) {
    return c.json({ error: 'Email already registered' }, 409)
  }

  const passwordHash = await hashPassword(password)
  const [user] = await db.insert(users).values({ email, passwordHash, fullName, businessName }).returning()

  const token = await signJwt({ userId: user.id, email: user.email })
  const { passwordHash: _, ...safeUser } = user

  return c.json({ token, user: safeUser }, 201)
})

authRouter.post('/login', async (c) => {
  const { email, password } = await c.req.json()

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)

  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) return c.json({ error: 'Invalid credentials' }, 401)

  const token = await signJwt({ userId: user.id, email: user.email })
  const { passwordHash: _, ...safeUser } = user

  return c.json({ token, user: safeUser }, 200)
})

authRouter.get('/me', authMiddleware, async (c) => {
  const userId = c.get('userId')
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user) return c.json({ error: 'Not found' }, 404)
  const { passwordHash: _, ...safeUser } = user
  return c.json(safeUser)
})
```

- [ ] **Step 7: Create packages/backend/src/index.ts**

```typescript
import 'dotenv/config'
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { authRouter } from './routes/auth'

export const app = new Hono()

app.route('/auth', authRouter)

app.get('/health', (c) => c.json({ ok: true }))

if (process.env.NODE_ENV !== 'test') {
  const port = Number(process.env.PORT) || 3000
  serve({ fetch: app.fetch, port })
  console.log(`Backend running on http://localhost:${port}`)
}
```

- [ ] **Step 8: Run tests — expect them to pass**

```bash
cd packages/backend && pnpm test
```

Expected: all 8 tests PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/backend/src packages/backend/test packages/backend/vitest.config.ts
git commit -m "feat: add auth API (register, login, /me) with JWT"
```

---

## Task 5: Frontend Shell

**Files:**
- Create: `packages/frontend/index.html`
- Create: `packages/frontend/vite.config.ts`
- Create: `packages/frontend/src/main.tsx`
- Create: `packages/frontend/src/App.tsx`
- Create: `packages/frontend/src/stores/auth.ts`
- Create: `packages/frontend/src/lib/api.ts`
- Create: `packages/frontend/tailwind.config.js`
- Create: `packages/frontend/postcss.config.js`
- Create: `packages/frontend/src/index.css`

- [ ] **Step 1: Create packages/frontend/index.html**

```html
<!DOCTYPE html>
<html lang="id">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>AdminAI</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create packages/frontend/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})
```

- [ ] **Step 3: Create packages/frontend/tailwind.config.js**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 4: Create packages/frontend/postcss.config.js**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 5: Create packages/frontend/src/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Create packages/frontend/src/stores/auth.ts**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  email: string
  fullName: string
  businessName: string
}

interface AuthStore {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      clearAuth: () => set({ token: null, user: null }),
    }),
    { name: 'adminai-auth' }
  )
)
```

- [ ] **Step 7: Create packages/frontend/src/lib/api.ts**

```typescript
import { useAuthStore } from '../stores/auth'

const BASE = '/api'

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().token
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw Object.assign(new Error(err.error || 'Request failed'), { status: res.status })
  }
  return res.json()
}
```

- [ ] **Step 8: Create packages/frontend/src/App.tsx**

```typescript
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from './stores/auth'
import { RegisterPage } from './pages/RegisterPage'
import { LoginPage } from './pages/LoginPage'
import { ChatPage } from './pages/ChatPage'

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
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
```

- [ ] **Step 9: Create packages/frontend/src/main.tsx**

```typescript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 10: Commit**

```bash
git add packages/frontend/src packages/frontend/index.html packages/frontend/vite.config.ts packages/frontend/tailwind.config.js packages/frontend/postcss.config.js
git commit -m "feat: add React/Vite frontend shell with routing and auth store"
```

---

## Task 6: Register & Login Pages

**Files:**
- Create: `packages/frontend/src/pages/RegisterPage.tsx`
- Create: `packages/frontend/src/pages/LoginPage.tsx`

- [ ] **Step 1: Create packages/frontend/src/pages/RegisterPage.tsx**

```typescript
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useAuthStore } from '../stores/auth'

export function RegisterPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({
    email: '', password: '', fullName: '', businessName: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<{ token: string; user: any }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setAuth(data.token, data.user)
      navigate('/chat')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Daftar AdminAI</h1>
        <p className="text-gray-500 text-sm mb-6">AI agent untuk usaha kamu</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
            <input
              type="text"
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Budi Santoso"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nama Bisnis</label>
            <input
              type="text"
              required
              value={form.businessName}
              onChange={(e) => setForm({ ...form, businessName: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Toko Makmur"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="budi@tokoku.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Minimal 8 karakter"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Mendaftar...' : 'Daftar Sekarang'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Sudah punya akun?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">Masuk</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create packages/frontend/src/pages/LoginPage.tsx**

```typescript
import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { useAuthStore } from '../stores/auth'

export function LoginPage() {
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [form, setForm] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<{ token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setAuth(data.token, data.user)
      navigate('/chat')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 w-full max-w-md p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Masuk ke AdminAI</h1>
        <p className="text-gray-500 text-sm mb-6">Selamat datang kembali</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Masuk...' : 'Masuk'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500 mt-4">
          Belum punya akun?{' '}
          <Link to="/register" className="text-blue-600 hover:underline">Daftar</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/frontend/src/pages/RegisterPage.tsx packages/frontend/src/pages/LoginPage.tsx
git commit -m "feat: add register and login pages"
```

---

## Task 7: Chat Page Placeholder + Smoke Test

**Files:**
- Create: `packages/frontend/src/pages/ChatPage.tsx`

- [ ] **Step 1: Create packages/frontend/src/pages/ChatPage.tsx**

```typescript
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'

export function ChatPage() {
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const navigate = useNavigate()

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
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

      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-gray-400">
          <p className="text-lg font-medium">Halo, {user?.fullName}!</p>
          <p className="text-sm mt-1">Agent sedang disiapkan — Plan 2 akan mengaktifkan chat ini.</p>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Start backend and frontend, verify the full flow manually**

Terminal 1:
```bash
cd packages/backend && pnpm dev
```

Terminal 2:
```bash
cd packages/frontend && pnpm dev
```

Open `http://localhost:5173/register` — isi form, submit, verify redirect ke `/chat`.
Open `http://localhost:5173/login` — login, verify redirect ke `/chat`.
Refresh `/chat` — verify user tetap login (Zustand persist).
Klik Keluar — verify redirect ke `/login`.

- [ ] **Step 3: Run backend tests one final time**

```bash
cd packages/backend && pnpm test
```

Expected: all tests PASS.

- [ ] **Step 4: Final commit**

```bash
git add packages/frontend/src/pages/ChatPage.tsx
git commit -m "feat: add chat page placeholder, Plan 1 complete"
```

---

## Self-Review Checklist (completed)

- **Spec coverage:** Auth (register/login/JWT) ✓, DB schema all tables ✓, frontend shell ✓, protected routes ✓. Chat page is a placeholder — intentional, filled by Plan 2.
- **No placeholders:** All steps have concrete code. No TBDs.
- **Type consistency:** `users` table fields in schema.ts match exactly what's used in `auth.ts` (id, email, passwordHash, fullName, businessName). `useAuthStore` User interface matches fields returned by `/auth/register`.
- **`bigint` in schema:** `amount` and `totalAmount` use `bigint({ mode: 'number' })` — consistent throughout.
