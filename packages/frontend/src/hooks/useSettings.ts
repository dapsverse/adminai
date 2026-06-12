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

  const connectTelegram = async (botToken: string, telegramChatId: string): Promise<boolean> => {
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch<ConnectResult>('/auth/telegram', {
        method: 'PUT',
        body: JSON.stringify({ botToken, telegramChatId }),
      })
      setBotUsername(data.botUsername)
      if (user && token) setAuth(token, { ...user, telegramConnected: true })
      return true
    } catch (err: any) {
      setError(err.message ?? 'Gagal menghubungkan Telegram.')
      return false
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

  return { loading, error, botUsername, connectTelegram, disconnectTelegram, clearError: () => setError(null) }
}
