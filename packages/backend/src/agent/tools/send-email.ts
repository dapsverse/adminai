import { db } from '../../db'
import { users } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { sendGmail } from '../../lib/gmail'
import type { Tool, ToolResult } from './types'

export const sendEmailTool: Tool = {
  name: 'send_email',
  description:
    'Kirim email via Gmail user yang sudah terhubung. Gunakan saat user meminta mengirim email ke seseorang.',
  parameters: {
    type: 'OBJECT',
    properties: {
      to: {
        type: 'STRING',
        description: 'Alamat email penerima, contoh: budi@example.com',
      },
      subject: {
        type: 'STRING',
        description: 'Judul/subjek email',
      },
      body: {
        type: 'STRING',
        description: 'Isi pesan email dalam plain text',
      },
    },
    required: ['to', 'subject', 'body'],
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

    const to = args.to as string
    const subject = args.subject as string
    const body = args.body as string

    await sendGmail(user.googleAccessToken, user.googleRefreshToken, to, subject, body)

    return {
      success: true,
      data: {
        message: `Email berhasil dikirim ke ${to}`,
        from: user.googleEmail,
        to,
        subject,
      },
    }
  },
}
