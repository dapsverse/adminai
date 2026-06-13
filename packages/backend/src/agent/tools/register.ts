import { registerTool } from './index'
import { createTransactionTool } from './create-transaction'
import { getBalanceTool } from './get-balance'
import { listTransactionsTool } from './list-transactions'
import { createInvoiceTool } from './create-invoice'
import { listInvoicesTool } from './list-invoices'
import { markInvoicePaidTool } from './mark-invoice-paid'
import { scheduleReportTool } from './schedule-report'
import { listReportsTool } from './list-reports'
import { deleteReportTool } from './delete-report'
import { connectTelegramTool } from './connect-telegram'

export function registerTools(): void {
  registerTool(createTransactionTool)
  registerTool(getBalanceTool)
  registerTool(listTransactionsTool)
  registerTool(createInvoiceTool)
  registerTool(listInvoicesTool)
  registerTool(markInvoicePaidTool)
  registerTool(scheduleReportTool)
  registerTool(listReportsTool)
  registerTool(deleteReportTool)
  registerTool(connectTelegramTool)
}
