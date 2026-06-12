import { useState, useCallback, useEffect } from 'react'
import { apiFetch } from '../lib/api'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [historyLoaded, setHistoryLoaded] = useState(false)

  // Load history on mount
  useEffect(() => {
    apiFetch<{ messages: Message[] }>('/chat/history')
      .then(data => {
        if (data.messages.length > 0) setMessages(data.messages)
      })
      .catch(() => {})
      .finally(() => setHistoryLoaded(true))
  }, [])

  const send = useCallback(async (content: string) => {
    if (!content.trim() || loading) return

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setError(null)

    try {
      const data = await apiFetch<{ reply: string }>('/chat', {
        method: 'POST',
        body: JSON.stringify({ message: content.trim() }),
      })
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.reply,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch {
      setError('Gagal mengirim pesan. Coba lagi.')
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
    } finally {
      setLoading(false)
    }
  }, [loading])

  return { messages, loading, error, send, historyLoaded }
}
