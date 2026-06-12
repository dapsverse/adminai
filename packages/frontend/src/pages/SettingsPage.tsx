import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { useSettings } from '../hooks/useSettings'

export function SettingsPage() {
  const user = useAuthStore((s) => s.user)
  const { loading, error, botUsername, connectTelegram, disconnectTelegram, clearError } = useSettings()
  const [botToken, setBotToken] = useState('')
  const [chatId, setChatId] = useState('')

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault()
    const ok = await connectTelegram(botToken.trim(), chatId.trim())
    if (ok) {
      setBotToken('')
      setChatId('')
    }
  }

  const isConnected = user?.telegramConnected || !!botUsername

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <h1 className="font-semibold text-gray-900">Pengaturan</h1>
        <Link to="/chat" className="text-sm text-gray-500 hover:text-gray-700">
          Kembali ke Chat
        </Link>
      </header>

      <div className="max-w-lg mx-auto px-4 py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Telegram</h2>
          <p className="text-sm text-gray-500 mb-4">
            Chat dengan AdminAI langsung dari Telegram menggunakan bot pribadi kamu.
          </p>

          {isConnected ? (
            <div className="space-y-3">
              <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
                Terhubung ke @{botUsername ?? 'bot kamu'}
              </p>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={disconnectTelegram}
                disabled={loading}
                className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
              >
                {loading ? 'Memutus...' : 'Putus koneksi'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleConnect} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bot Token
                </label>
                <input
                  type="text"
                  value={botToken}
                  onChange={e => { setBotToken(e.target.value); clearError() }}
                  placeholder="123456789:ABCdef..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Buat bot baru di <span className="font-mono">@BotFather</span> di Telegram, lalu salin token-nya.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telegram Chat ID
                </label>
                <input
                  type="text"
                  value={chatId}
                  onChange={e => setChatId(e.target.value)}
                  placeholder="987654321"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Dapatkan ID kamu dengan kirim pesan ke <span className="font-mono">@userinfobot</span> di Telegram.
                </p>
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={!botToken.trim() || !chatId.trim() || loading}
                className="w-full bg-blue-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? 'Menghubungkan...' : 'Hubungkan Telegram'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
