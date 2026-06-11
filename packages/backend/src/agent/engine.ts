import { db } from '../db'
import { users } from '../db/schema'
import { eq } from 'drizzle-orm'
import { getLlmProvider } from '../lib/llm'
import { loadContext, saveMessage } from './context'
import { getOnboardingState, setOnboardingStep, buildOnboardingMessage } from './onboarding'
import { getAllTools, getTool } from './tools'

function buildSystemPrompt(fullName: string, businessName: string): string {
  return `Kamu adalah AdminAI, asisten AI untuk usaha kecil.
Pengguna: ${fullName} | Bisnis: ${businessName}
Tugasmu: membantu mengelola keuangan dan invoice melalui percakapan.
Jawab dalam Bahasa Indonesia yang santai dan ramah.
Jika diminta fitur yang belum tersedia, beritahu bahwa sedang dikembangkan.`.trim()
}

export async function processMessage(userId: string, message: string): Promise<string> {
  const [user] = await db
    .select({ fullName: users.fullName, businessName: users.businessName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) throw new Error('User not found')

  const onboarding = await getOnboardingState(userId)

  let reply: string

  if (onboarding.step === 'OFFER_INTEGRATIONS') {
    reply = buildOnboardingMessage(user.fullName, user.businessName)
    await setOnboardingStep(userId, 'ACTIVE')
  } else {
    const history = await loadContext(userId)
    const tools = getAllTools()
    const llm = getLlmProvider()
    const systemPrompt = buildSystemPrompt(user.fullName, user.businessName)

    const response = await llm.chat(
      systemPrompt,
      history,
      message,
      tools.map(t => ({ name: t.name, description: t.description, parameters: t.parameters }))
    )

    if (response.toolCalls.length > 0) {
      const tc = response.toolCalls[0]
      const tool = getTool(tc.name)

      if (!tool) {
        reply = 'Maaf, fitur tersebut belum tersedia saat ini.'
      } else {
        const result = await tool.execute(tc.args, userId)
        const historyWithCurrentMessage = [
          ...history,
          { role: 'user' as const, content: message },
        ]
        const followUp = await llm.chat(
          systemPrompt,
          historyWithCurrentMessage,
          `Data dari ${tc.name}: ${JSON.stringify(result.data ?? result.error)}\nBerikan respons informatif kepada pengguna.`
        )
        reply = followUp.content ?? 'Maaf, tidak ada respons.'
      }
    } else {
      reply = response.content ?? 'Maaf, tidak ada respons.'
    }
  }

  await saveMessage(userId, 'user', message)
  await saveMessage(userId, 'assistant', reply)

  return reply
}
