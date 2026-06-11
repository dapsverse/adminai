import { GeminiProvider } from './gemini'
import type { LlmProvider } from './types'

let provider: LlmProvider | null = null

export function getLlmProvider(): LlmProvider {
  if (!provider) {
    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) throw new Error('GEMINI_API_KEY is not set')
    provider = new GeminiProvider(apiKey)
  }
  return provider
}

// Used in tests to inject a mock provider
export function setLlmProvider(p: LlmProvider): void {
  provider = p
}
