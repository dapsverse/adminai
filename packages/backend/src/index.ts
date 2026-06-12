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
