import { db } from '../../db'
import { invoices } from '../../db/schema'
import { eq, and, gte, count } from 'drizzle-orm'
import type { Tool, ToolResult } from './types'

async function nextInvoiceNumber(userId: string): Promise<string> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [row] = await db
    .select({ n: count() })
    .from(invoices)
    .where(and(
      eq(invoices.userId, userId),
      gte(invoices.createdAt, startOfMonth),
    ))

  const seq = String((row?.n ?? 0) + 1).padStart(3, '0')
  const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  return `INV-${yearMonth}-${seq}`
}

export const createInvoiceTool: Tool = {
  name: 'create_invoice',
  description: 'Buat invoice baru. outgoing = invoice yang kita kirim ke client (tagihan). incoming = tagihan dari supplier yang kita terima.',
  parameters: {
    type: 'OBJECT',
    properties: {
      direction: {
        type: 'STRING',
        enum: ['outgoing', 'incoming'],
        description: 'outgoing: kita tagih client. incoming: supplier tagih kita.',
      },
      clientName: {
        type: 'STRING',
        description: 'Nama client (outgoing) atau nama supplier (incoming)',
      },
      clientEmail: {
        type: 'STRING',
        description: 'Email client atau supplier (opsional)',
      },
      items: {
        type: 'ARRAY',
        description: 'Daftar item atau jasa yang ditagihkan',
        items: {
          type: 'OBJECT',
          properties: {
            description: { type: 'STRING', description: 'Nama item atau jasa' },
            qty: { type: 'NUMBER', description: 'Jumlah unit' },
            price: { type: 'NUMBER', description: 'Harga per unit dalam Rupiah' },
          },
          required: ['description', 'qty', 'price'],
        },
      },
      dueDate: {
        type: 'STRING',
        description: 'Tanggal jatuh tempo (ISO 8601, opsional)',
      },
    },
    required: ['direction', 'clientName', 'items'],
  },

  async execute(args, userId): Promise<ToolResult> {
    const direction = args.direction as string | undefined
    const clientName = args.clientName as string | undefined
    const items = args.items as Array<{ description: string; qty: number; price: number }> | undefined

    if (!direction || (direction !== 'outgoing' && direction !== 'incoming')) {
      return { success: false, error: 'direction harus outgoing atau incoming' }
    }
    if (!clientName) {
      return { success: false, error: 'clientName harus diisi' }
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'items harus berisi minimal 1 item' }
    }

    try {
      const totalAmount = items.reduce((sum, item) => sum + item.qty * item.price, 0)
      const invoiceNumber = await nextInvoiceNumber(userId)
      const status = direction === 'outgoing' ? 'draft' : 'received'

      const [inv] = await db.insert(invoices).values({
        userId,
        direction,
        invoiceNumber,
        clientName,
        clientEmail: args.clientEmail as string | undefined,
        items,
        totalAmount: Math.round(totalAmount),
        status,
        dueDate: args.dueDate ? new Date(args.dueDate as string) : undefined,
      }).returning()

      return { success: true, data: inv }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}
