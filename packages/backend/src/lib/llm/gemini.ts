import { GoogleGenerativeAI, FunctionCallingMode } from '@google/generative-ai'
import type { LlmMessage, LlmTool, LlmResponse, LlmProvider } from './types'

export class GeminiProvider implements LlmProvider {
  private readonly client: GoogleGenerativeAI
  private readonly modelName: string

  constructor(apiKey: string, modelName = 'gemini-2.0-flash') {
    this.client = new GoogleGenerativeAI(apiKey)
    this.modelName = modelName
  }

  async chat(
    systemPrompt: string,
    history: LlmMessage[],
    message: string,
    tools: LlmTool[] = []
  ): Promise<LlmResponse> {
    type ModelConfig = Parameters<typeof this.client.getGenerativeModel>[0]
    const config: ModelConfig = {
      model: this.modelName,
      systemInstruction: systemPrompt,
    }

    if (tools.length > 0) {
      config.tools = [{
        functionDeclarations: tools.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters as any,
        })),
      }]
      config.toolConfig = {
        functionCallingConfig: { mode: FunctionCallingMode.AUTO },
      }
    }

    const model = this.client.getGenerativeModel(config)

    const chat = model.startChat({
      history: history.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      })),
    })

    const result = await chat.sendMessage(message)
    const response = result.response
    const functionCalls = response.functionCalls() ?? []

    if (functionCalls.length > 0) {
      return {
        content: null,
        toolCalls: functionCalls.map(fc => ({
          name: fc.name,
          args: fc.args as Record<string, unknown>,
        })),
      }
    }

    return { content: response.text(), toolCalls: [] }
  }
}
