import type { Tool } from './types'

const registry = new Map<string, Tool>()

export function registerTool(tool: Tool): void {
  registry.set(tool.name, tool)
}

export function getTool(name: string): Tool | undefined {
  return registry.get(name)
}

export function getAllTools(): Tool[] {
  return Array.from(registry.values())
}
