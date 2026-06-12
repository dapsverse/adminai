import { db } from '../db'
import { conversationMessages } from '../db/schema'
import { eq, desc } from 'drizzle-orm'
import type { LlmMessage } from '../lib/llm/types'

const WINDOW_SIZE = 20

export async function loadContext(userId: string): Promise<LlmMessage[]> {
  const rows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.userId, userId))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(WINDOW_SIZE)

  return rows
    .reverse()
    .filter(r => r.role === 'user' || r.role === 'assistant')
    .map(r => ({
      role: r.role as 'user' | 'assistant',
      content: r.content ?? '',
    }))
}

export async function saveMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string,
  channel: 'web' | 'telegram' = 'web'
): Promise<void> {
  await db.insert(conversationMessages).values({
    userId,
    channel,
    role,
    content,
  })
}

export async function loadHistory(
  userId: string
): Promise<Array<{ id: string; role: 'user' | 'assistant'; content: string }>> {
  const rows = await db
    .select({
      id: conversationMessages.id,
      role: conversationMessages.role,
      content: conversationMessages.content,
    })
    .from(conversationMessages)
    .where(eq(conversationMessages.userId, userId))
    .orderBy(desc(conversationMessages.createdAt))
    .limit(WINDOW_SIZE)

  return rows
    .reverse()
    .filter(r => r.role === 'user' || r.role === 'assistant')
    .map(r => ({
      id: r.id,
      role: r.role as 'user' | 'assistant',
      content: r.content ?? '',
    }))
}
