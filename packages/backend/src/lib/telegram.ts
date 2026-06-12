export interface TelegramBotInfo {
  id: number
  username: string
  firstName: string
}

export interface TelegramClient {
  getMe(token: string): Promise<TelegramBotInfo>
  setWebhook(token: string, url: string): Promise<void>
  deleteWebhook(token: string): Promise<void>
  sendMessage(token: string, chatId: string, text: string): Promise<void>
}

class HttpTelegramClient implements TelegramClient {
  private async call(token: string, method: string, body?: object): Promise<unknown> {
    let res: Response
    try {
      res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
      })
    } catch (err) {
      throw new Error(`Telegram network error on ${method}: ${err instanceof Error ? err.message : String(err)}`)
    }
    let json: { ok: boolean; result?: unknown; description?: string }
    try {
      json = await res.json() as { ok: boolean; result?: unknown; description?: string }
    } catch {
      throw new Error(`Telegram returned non-JSON response on ${method} (HTTP ${res.status})`)
    }
    if (!json.ok) throw new Error(json.description ?? `Telegram API error on ${method}`)
    return json.result
  }

  async getMe(token: string): Promise<TelegramBotInfo> {
    const result = await this.call(token, 'getMe') as { id: number; username: string; first_name: string }
    return { id: result.id, username: result.username, firstName: result.first_name }
  }

  async setWebhook(token: string, url: string): Promise<void> {
    await this.call(token, 'setWebhook', { url })
  }

  async deleteWebhook(token: string): Promise<void> {
    await this.call(token, 'deleteWebhook')
  }

  async sendMessage(token: string, chatId: string, text: string): Promise<void> {
    await this.call(token, 'sendMessage', { chat_id: chatId, text })
  }
}

let client: TelegramClient = new HttpTelegramClient()

export function setTelegramClient(c: TelegramClient): void {
  client = c
}

export function getTelegramClient(): TelegramClient {
  return client
}
