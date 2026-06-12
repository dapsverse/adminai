import { db } from '../../db'
import { invoices } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import type { Tool, ToolResult } from './types'

export const markInvoicePaidTool: Tool = {
  name: 'mark_invoice_paid',
  description: 'Tandai invoice sebagai sudah lunas (paid). Gunakan saat client sudah bayar invoice outgoing, atau saat kita sudah bayar tagihan incoming.',
  parameters: {
    type: 'OBJECT',
    properties: {
      invoiceId: {
        type: 'STRING',
        description: 'ID invoice yang sudah lunas',
      },
    },
    required: ['invoiceId'],
  },

  async execute(args, userId): Promise<ToolResult> {
    const invoiceId = args.invoiceId as string | undefined
    if (!invoiceId) {
      return { success: false, error: 'invoiceId harus diisi' }
    }

    try {
      const [updated] = await db
        .update(invoices)
        .set({ status: 'paid', paidAt: new Date() })
        .where(and(
          eq(invoices.id, invoiceId),
          eq(invoices.userId, userId),
        ))
        .returning()

      if (!updated) {
        return { success: false, error: 'Invoice tidak ditemukan' }
      }

      return { success: true, data: updated }
    } catch (err: any) {
      return { success: false, error: err.message }
    }
  },
}
