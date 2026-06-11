import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth'
import { useChat } from '../hooks/useChat'
import { ChatMessage } from '../components/ChatMessage'

export function ChatPage() {
  const user = useAuthStore((s) => s.user)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const navigate = useNavigate()
  const { messages, loading, error, send } = useChat()
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  const handleLogout = () => {
    clearAuth()
    navigate('/login')
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    send(input)
    setInput('')
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
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

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && !loading && (
          <div className="flex-1 flex items-center justify-center h-full">
            <div className="text-center text-gray-400 mt-20">
              <p className="text-lg font-medium">Halo, {user?.fullName}!</p>
              <p className="text-sm mt-1">Ketik pesan untuk mulai berbicara dengan AdminAI.</p>
            </div>
          </div>
        )}

        {messages.map(msg => (
          <ChatMessage key={msg.id} role={msg.role} content={msg.content} />
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100">
              <span className="flex gap-1 items-center h-4">
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {error && (
          <p className="text-center text-sm text-red-500">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-200 px-4 py-4 flex-shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-3 max-w-2xl mx-auto">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ketik pesan..."
            disabled={loading}
            className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="bg-blue-600 text-white rounded-full px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Kirim
          </button>
        </form>
      </div>
    </div>
  )
}
