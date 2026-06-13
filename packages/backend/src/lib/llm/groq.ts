import Groq from 'groq-sdk'
import type { LlmMessage, LlmTool, LlmResponse, LlmProvider } from './types'

export class GroqProvider implements LlmProvider {
  private readonly client: Groq
  private readonly modelName: string

  constructor(apiKey: string, modelName = 'llama-3.3-70b-versatile') {
    this.client = new Groq({ apiKey })
    this.modelName = modelName
  }

  async chat(
    systemPrompt: string,
    history: LlmMessage[],
    message: string,
    tools: LlmTool[] = []
  ): Promise<LlmResponse> {
    const messages: Groq.Chat.Completions.MessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      { role: 'user', content: message },
    ]

    const params: Groq.Chat.Completions.ChatCompletionCreateParamsNonStreaming = {
      model: this.modelName,
      messages,
    }

    if (tools.length > 0) {
      params.tools = tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }))
      params.tool_choice = 'auto'
    }

    const response = await this.client.chat.completions.create(params)
    const msg = response.choices[0].message

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        content: null,
        toolCalls: msg.tool_calls.map(tc => ({
          name: tc.function.name,
          args: JSON.parse(tc.function.arguments) as Record<string, unknown>,
        })),
      }
    }

    return { content: msg.content ?? '', toolCalls: [] }
  }
}
