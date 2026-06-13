import { generateAuthUrl } from '../../lib/gmail'
import type { Tool, ToolResult } from './types'

export const connectEmailTool: Tool = {
  name: 'connect_email',
  description: 'Generate link OAuth Gmail untuk menghubungkan akun email user ke AdminAI.',
  parameters: {
    type: 'OBJECT',
    properties: {},
  },

  async execute(_args, userId): Promise<ToolResult> {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return { success: false, error: 'Google OAuth belum dikonfigurasi di server.' }
    }
    const authUrl = generateAuthUrl(userId)
    return { success: true, data: { authUrl } }
  },
}
