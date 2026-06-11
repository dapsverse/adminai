export interface LlmMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LlmTool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface LlmToolCall {
  name: string
  args: Record<string, unknown>
}

export interface LlmResponse {
  content: string | null
  toolCalls: LlmToolCall[]
}

export interface LlmProvider {
  chat(
    systemPrompt: string,
    history: LlmMessage[],
    message: string,
    tools?: LlmTool[]
  ): Promise<LlmResponse>
}
