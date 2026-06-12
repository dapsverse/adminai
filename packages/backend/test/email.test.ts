import { describe, it, expect, afterEach, vi } from 'vitest'
import { isEmailConfigured, getEmailClient, setEmailClient, NodemailerEmailClient } from '../src/lib/email'
import type { EmailClient } from '../src/lib/email'

class MockEmailClient implements EmailClient {
  readonly sent: Array<{ to: string; subject: string; text: string }> = []
  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    this.sent.push({ to, subject, text })
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isEmailConfigured', () => {
  it('returns false when SMTP_HOST is missing', () => {
    vi.stubEnv('SMTP_HOST', '')
    vi.stubEnv('SMTP_USER', 'user')
    vi.stubEnv('SMTP_PASS', 'pass')
    expect(isEmailConfigured()).toBe(false)
  })

  it('returns false when SMTP_USER is missing', () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com')
    vi.stubEnv('SMTP_USER', '')
    vi.stubEnv('SMTP_PASS', 'pass')
    expect(isEmailConfigured()).toBe(false)
  })

  it('returns false when SMTP_PASS is missing', () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com')
    vi.stubEnv('SMTP_USER', 'user')
    vi.stubEnv('SMTP_PASS', '')
    expect(isEmailConfigured()).toBe(false)
  })

  it('returns true when all SMTP vars are set', () => {
    vi.stubEnv('SMTP_HOST', 'smtp.example.com')
    vi.stubEnv('SMTP_USER', 'user')
    vi.stubEnv('SMTP_PASS', 'pass')
    expect(isEmailConfigured()).toBe(true)
  })
})

describe('NodemailerEmailClient', () => {
  it('throws when SMTP not configured', async () => {
    vi.stubEnv('SMTP_HOST', '')
    vi.stubEnv('SMTP_USER', '')
    vi.stubEnv('SMTP_PASS', '')
    const client = new NodemailerEmailClient()
    await expect(client.sendEmail('to@example.com', 'Subject', 'Body')).rejects.toThrow('SMTP not configured')
  })
})

describe('getEmailClient / setEmailClient', () => {
  afterEach(() => {
    setEmailClient(new NodemailerEmailClient())
  })

  it('returns MockEmailClient after setEmailClient', async () => {
    const mock = new MockEmailClient()
    setEmailClient(mock)
    await getEmailClient().sendEmail('a@b.com', 'Hi', 'Body')
    expect(mock.sent).toHaveLength(1)
    expect(mock.sent[0].to).toBe('a@b.com')
  })
})
