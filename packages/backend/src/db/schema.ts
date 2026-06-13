import {
  pgTable, pgEnum, text, integer, bigint,
  timestamp, jsonb, boolean, index,
} from 'drizzle-orm/pg-core'
import { createId } from '@paralleldrive/cuid2'

export const userTierEnum = pgEnum('user_tier', ['free', 'premium'])
export const transactionTypeEnum = pgEnum('transaction_type', ['income', 'expense'])
export const transactionSourceEnum = pgEnum('transaction_source', ['manual', 'email_parsed', 'agent'])
export const invoiceDirectionEnum = pgEnum('invoice_direction', ['outgoing', 'incoming'])
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'sent', 'paid', 'overdue', 'received'])
export const channelEnum = pgEnum('channel', ['web', 'telegram'])
export const messageRoleEnum = pgEnum('message_role', ['user', 'assistant', 'tool'])
export const reportTypeEnum = pgEnum('report_type', ['daily', 'weekly', 'monthly', 'custom'])
export const reportDeliveryEnum = pgEnum('report_delivery', ['telegram', 'email', 'both'])
export const toolStatusEnum = pgEnum('tool_status', ['temporary', 'permanent'])

export const users = pgTable('users', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: text('full_name').notNull(),
  businessName: text('business_name').notNull(),
  invoiceSenderName: text('invoice_sender_name'),
  telegramBotToken: text('telegram_bot_token'),
  telegramUserId: text('telegram_user_id'),
  emailOauthToken: text('email_oauth_token'),
  googleAccessToken: text('google_access_token'),
  googleRefreshToken: text('google_refresh_token'),
  googleEmail: text('google_email'),
  emailPollIntervalMinutes: integer('email_poll_interval_minutes').default(60).notNull(),
  onboardingState: jsonb('onboarding_state'),
  tier: userTierEnum('tier').default('free').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const transactions = pgTable('transactions', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: transactionTypeEnum('type').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  currency: text('currency').default('IDR').notNull(),
  category: text('category'),
  description: text('description'),
  source: transactionSourceEnum('source').default('manual').notNull(),
  date: timestamp('date').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('transactions_user_id_idx').on(table.userId),
])

export const invoices = pgTable('invoices', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  direction: invoiceDirectionEnum('direction').notNull(),
  invoiceNumber: text('invoice_number').notNull(),
  clientName: text('client_name').notNull(),
  clientEmail: text('client_email'),
  items: jsonb('items').notNull().$type<Array<{ description: string; qty: number; price: number }>>(),
  totalAmount: bigint('total_amount', { mode: 'number' }).notNull(),
  status: invoiceStatusEnum('status').notNull(),
  dueDate: timestamp('due_date'),
  paidAt: timestamp('paid_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('invoices_user_id_idx').on(table.userId),
])

export const conversationMessages = pgTable('conversation_messages', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  channel: channelEnum('channel').notNull(),
  role: messageRoleEnum('role').notNull(),
  content: text('content'),
  toolCalls: jsonb('tool_calls'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('conversation_messages_user_id_idx').on(table.userId),
])

export const scheduledReports = pgTable('scheduled_reports', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: reportTypeEnum('type').notNull(),
  cronExpression: text('cron_expression').notNull(),
  delivery: reportDeliveryEnum('delivery').notNull(),
  lastRunAt: timestamp('last_run_at'),
  nextRunAt: timestamp('next_run_at'),
}, (table) => [
  index('scheduled_reports_user_id_idx').on(table.userId),
])

export const customTools = pgTable('custom_tools', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  description: text('description').notNull(),
  definition: jsonb('definition').notNull().$type<{ steps: Array<{ tool: string; params: Record<string, unknown> }> }>(),
  status: toolStatusEnum('status').default('temporary').notNull(),
  creatorUserId: text('creator_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  index('custom_tools_creator_user_id_idx').on(table.creatorUserId),
])

export const toolUsageLog = pgTable('tool_usage_log', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  toolId: text('tool_id').notNull().references(() => customTools.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  usedAt: timestamp('used_at').defaultNow().notNull(),
}, (table) => [
  index('tool_usage_log_tool_id_idx').on(table.toolId),
  index('tool_usage_log_user_id_idx').on(table.userId),
])
