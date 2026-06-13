import { google } from 'googleapis'

export function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/auth/google/callback'
  )
}

export function generateAuthUrl(userId: string): string {
  const client = createOAuthClient()
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: userId,
    prompt: 'consent',
  })
}

export async function sendGmail(
  accessToken: string,
  refreshToken: string,
  to: string,
  subject: string,
  body: string
): Promise<void> {
  const client = createOAuthClient()
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken })

  const gmail = google.gmail({ version: 'v1', auth: client })
  const raw = Buffer.from(
    `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
  ).toString('base64url')

  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}
