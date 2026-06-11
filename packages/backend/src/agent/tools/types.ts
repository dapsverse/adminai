export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
}

export interface Tool {
  name: string
  description: string
  parameters: Record<string, unknown>
  execute(args: Record<string, unknown>, userId: string): Promise<ToolResult>
}
