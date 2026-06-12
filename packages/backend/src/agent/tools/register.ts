import { registerTool } from './index'
import { createTransactionTool } from './create-transaction'
import { getBalanceTool } from './get-balance'
import { listTransactionsTool } from './list-transactions'
import { createInvoiceTool } from './create-invoice'
import { listInvoicesTool } from './list-invoices'
import { markInvoicePaidTool } from './mark-invoice-paid'

export function registerTools(): void {
  registerTool(createTransactionTool)
  registerTool(getBalanceTool)
  registerTool(listTransactionsTool)
  registerTool(createInvoiceTool)
  registerTool(listInvoicesTool)
  registerTool(markInvoicePaidTool)
}
