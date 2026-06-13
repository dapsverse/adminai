import { eq } from 'drizzle-orm'
import { db } from '../../db'
import { users } from '../../db/schema'
import { getTelegramClient } from '../../lib/telegram'
import type { Tool, ToolResult } from './types'

export const connectTelegramTool: Tool = {
  name: 'connect_telegram',
  description: 'Hubungkan akun Telegram user ke AdminAI. Gunakan setelah user memberikan bot token dari BotFather dan Telegram user ID mereka.',
  parameters: {
    type: 'OBJECT',
    properties: {
      bot_token: {
        type: 'STRING',
        description: 'Bot token dari BotFather, format: 123456789:ABCdef...',
      },
      telegram_user_id: {
        type: 'STRING',
        description: 'Telegram user ID (Chat ID) dari @userinfobot, berupa angka seperti 123456789',
      },
    },
    required: ['bot_token', 'telegram_user_id'],
  },

  async execute(args, userId): Promise<ToolResult> {
    const botToken = args.bot_token as string | undefined
    const telegramUserId = args.telegram_user_id as string | undefined

    if (!botToken?.trim()) return { success: false, error: 'bot_token harus diisi' }
    if (!telegramUserId?.trim()) return { success: false, error: 'telegram_user_id harus diisi' }

    const telegram = getTelegramClient()

    let botUsername: string
    try {
      const info = await telegram.getMe(botToken)
      botUsername = info.username
    } catch {
      return { success: false, error: 'Bot token tidak valid. Pastikan kamu copy token yang benar dari BotFather.' }
    }

    const webhookBase = process.env.WEBHOOK_BASE_URL
    if (!webhookBase) {
      return { success: false, error: 'Server belum dikonfigurasi untuk menerima pesan Telegram (WEBHOOK_BASE_URL tidak diset).' }
    }

    try {
      await telegram.setWebhook(botToken, `${webhookBase}/telegram/webhook/${userId}`)
    } catch {
      return { success: false, error: 'Gagal mendaftarkan webhook ke Telegram. Coba lagi.' }
    }

    await db.update(users)
      .set({ telegramBotToken: botToken, telegramUserId: telegramUserId.trim() })
      .where(eq(users.id, userId))

    return {
      success: true,
      data: { botUsername, telegramUserId: telegramUserId.trim(), connected: true },
    }
  },
}
