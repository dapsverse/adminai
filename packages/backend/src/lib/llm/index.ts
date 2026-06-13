import { GroqProvider } from './groq'
import type { LlmProvider } from './types'

let provider: LlmProvider | null = null

export function getLlmProvider(): LlmProvider {
  if (!provider) {
    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) throw new Error('GROQ_API_KEY is not set')
    provider = new GroqProvider(apiKey)
  }
  return provider
}

// Used in tests to inject a mock provider
export function setLlmProvider(p: LlmProvider): void {
  provider = p
}
