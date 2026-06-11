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
