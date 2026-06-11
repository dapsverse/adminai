import 'dotenv/config'
import { db } from '../src/db'
import {
  toolUsageLog, customTools, scheduledReports,
  conversationMessages, invoices, transactions, users,
} from '../src/db/schema'

export async function cleanDb() {
  await db.delete(toolUsageLog)
  await db.delete(customTools)
  await db.delete(scheduledReports)
  await db.delete(conversationMessages)
  await db.delete(invoices)
  await db.delete(transactions)
  await db.delete(users)
}
