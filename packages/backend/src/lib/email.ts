import nodemailer from 'nodemailer'

export interface EmailClient {
  sendEmail(to: string, subject: string, text: string): Promise<void>
}

export class NodemailerEmailClient implements EmailClient {
  async sendEmail(to: string, subject: string, text: string): Promise<void> {
    const host = process.env.SMTP_HOST
    const port = parseInt(process.env.SMTP_PORT ?? '587', 10)
    const user = process.env.SMTP_USER
    const pass = process.env.SMTP_PASS
    const from = process.env.EMAIL_FROM ?? 'AdminAI <reports@adminai.id>'

    if (!host || !user || !pass) {
      throw new Error('SMTP tidak dikonfigurasi. Set SMTP_HOST, SMTP_USER, SMTP_PASS di environment.')
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    })

    await transporter.sendMail({ from, to, subject, text })
  }
}

let client: EmailClient = new NodemailerEmailClient()

export function setEmailClient(c: EmailClient): void {
  client = c
}

export function getEmailClient(): EmailClient {
  return client
}

export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}
