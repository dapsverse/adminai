import { db } from '../../db'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { google } from 'googleapis'
import { createOAuthClient } from '../../lib/gmail'
import type { Tool, ToolResult } from './types'

export const readEmailsTool: Tool = {
  name: 'read_emails',
  description:
    'Baca email dari Gmail user yang sudah terhubung. Gunakan saat user meminta cek email, lihat pesan masuk, atau mencari email dari pengirim/subjek tertentu.',
  parameters: {
    type: 'OBJECT',
    properties: {
      query: {
        type: 'STRING',
        description:
          'Query pencarian Gmail, contoh: "from:maybank", "subject:invoice", "is:unread". Kosongkan untuk 5 email terbaru.',
      },
      max_results: {
        type: 'NUMBER',
        description: 'Jumlah email yang ditampilkan, default 5, maksimum 10.',
      },
    },
  },

  async execute(args, userId): Promise<ToolResult> {
    const [user] = await db
      .select({
        googleAccessToken: users.googleAccessToken,
        googleRefreshToken: users.googleRefreshToken,
        googleEmail: users.googleEmail,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)

    if (!user?.googleAccessToken || !user?.googleRefreshToken) {
      return {
        success: false,
        error: 'Gmail belum terhubung. Ketik "connect email" untuk menghubungkan Gmail.',
      }
    }

    const client = createOAuthClient()
    client.setCredentials({
      access_token: user.googleAccessToken,
      refresh_token: user.googleRefreshToken,
    })

    client.on('tokens', async (tokens) => {
      if (tokens.access_token) {
        await db.update(users).set({ googleAccessToken: tokens.access_token }).where(eq(users.id, userId))
      }
    })

    const gmail = google.gmail({ version: 'v1', auth: client })
    const query = (args.query as string) || ''
    const maxResults = Math.min(Number(args.max_results) || 5, 10)

    try {
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults,
      })

      if (!listRes.data.messages?.length) {
        return {
          success: true,
          data: {
            emails: [],
            message: query
              ? `Tidak ada email yang cocok dengan pencarian "${query}".`
              : 'Tidak ada email masuk.',
          },
        }
      }

      const emails = await Promise.all(
        listRes.data.messages.map(async (msg) => {
          const full = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id!,
            format: 'metadata',
            metadataHeaders: ['From', 'To', 'Subject', 'Date'],
          })

          const headers = full.data.payload?.headers ?? []
          const get = (name: string) => headers.find((h) => h.name === name)?.value ?? ''

          return {
            id: msg.id,
            from: get('From'),
            to: get('To'),
            subject: get('Subject'),
            date: get('Date'),
            snippet: full.data.snippet ?? '',
          }
        })
      )

      return {
        success: true,
        data: {
          connectedAs: user.googleEmail,
          emails,
          totalFound: listRes.data.resultSizeEstimate,
        },
      }
    } catch (err) {
      const gErr = err as { response?: { status?: number; data?: { error?: string } } }
      const status = gErr?.response?.status
      const errCode = gErr?.response?.data?.error

      if (status === 401 || status === 403 || errCode === 'invalid_grant') {
        return {
          success: false,
          error: 'Akses Gmail ditolak atau token sudah kadaluarsa. Silakan hubungkan ulang Gmail kamu dengan ketik "connect email".',
        }
      }
      throw err
    }
  },
}
