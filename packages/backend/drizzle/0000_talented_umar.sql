CREATE TYPE "public"."channel" AS ENUM('web', 'telegram');--> statement-breakpoint
CREATE TYPE "public"."invoice_direction" AS ENUM('outgoing', 'incoming');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('draft', 'sent', 'paid', 'overdue', 'received');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant', 'tool');--> statement-breakpoint
CREATE TYPE "public"."report_delivery" AS ENUM('telegram', 'email', 'both');--> statement-breakpoint
CREATE TYPE "public"."report_type" AS ENUM('daily', 'weekly', 'monthly', 'custom');--> statement-breakpoint
CREATE TYPE "public"."tool_status" AS ENUM('temporary', 'permanent');--> statement-breakpoint
CREATE TYPE "public"."transaction_source" AS ENUM('manual', 'email_parsed', 'agent');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TYPE "public"."user_tier" AS ENUM('free', 'premium');--> statement-breakpoint
CREATE TABLE "conversation_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" "channel" NOT NULL,
	"role" "message_role" NOT NULL,
	"content" text,
	"tool_calls" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_tools" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"definition" jsonb NOT NULL,
	"status" "tool_status" DEFAULT 'temporary' NOT NULL,
	"creator_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"direction" "invoice_direction" NOT NULL,
	"invoice_number" text NOT NULL,
	"client_name" text NOT NULL,
	"client_email" text,
	"items" jsonb NOT NULL,
	"total_amount" bigint NOT NULL,
	"status" "invoice_status" NOT NULL,
	"due_date" timestamp,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "report_type" NOT NULL,
	"cron_expression" text NOT NULL,
	"delivery" "report_delivery" NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tool_usage_log" (
	"id" text PRIMARY KEY NOT NULL,
	"tool_id" text NOT NULL,
	"user_id" text NOT NULL,
	"used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" "transaction_type" NOT NULL,
	"amount" bigint NOT NULL,
	"currency" text DEFAULT 'IDR' NOT NULL,
	"category" text,
	"description" text,
	"source" "transaction_source" DEFAULT 'manual' NOT NULL,
	"date" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"business_name" text NOT NULL,
	"invoice_sender_name" text,
	"telegram_bot_token" text,
	"telegram_user_id" text,
	"email_oauth_token" text,
	"email_poll_interval_minutes" integer DEFAULT 60 NOT NULL,
	"onboarding_state" jsonb,
	"tier" "user_tier" DEFAULT 'free' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_tools" ADD CONSTRAINT "custom_tools_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_usage_log" ADD CONSTRAINT "tool_usage_log_tool_id_custom_tools_id_fk" FOREIGN KEY ("tool_id") REFERENCES "public"."custom_tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_usage_log" ADD CONSTRAINT "tool_usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;