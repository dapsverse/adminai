import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { google } from 'googleapis'
import { db } from '../db'
import { users } from '../db/schema'
import { createOAuthClient } from '../lib/gmail'

export const googleAuthRouter = new Hono()

googleAuthRouter.get('/auth/google/callback', async (c) => {
  const code = c.req.query('code')
  const userId = c.req.query('state')
  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173'

  if (!code || !userId) {
    return c.redirect(`${frontendUrl}/chat?email_error=missing_params`)
  }

  try {
    const client = createOAuthClient()
    const { tokens } = await client.getToken(code)

    client.setCredentials(tokens)
    const oauth2 = google.oauth2({ version: 'v2', auth: client })
    const { data } = await oauth2.userinfo.get()

    await db.update(users)
      .set({
        googleAccessToken: tokens.access_token ?? null,
        googleRefreshToken: tokens.refresh_token ?? null,
        googleEmail: data.email ?? null,
      })
      .where(eq(users.id, userId))

    return c.redirect(`${frontendUrl}/chat?email_connected=1`)
  } catch (err) {
    console.error('[google-auth] callback error:', err)
    return c.redirect(`${frontendUrl}/chat?email_error=oauth_failed`)
  }
})
