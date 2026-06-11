ALTER TABLE "custom_tools" DROP CONSTRAINT "custom_tools_creator_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "custom_tools" ADD CONSTRAINT "custom_tools_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversation_messages_user_id_idx" ON "conversation_messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "custom_tools_creator_user_id_idx" ON "custom_tools" USING btree ("creator_user_id");--> statement-breakpoint
CREATE INDEX "invoices_user_id_idx" ON "invoices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "scheduled_reports_user_id_idx" ON "scheduled_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "tool_usage_log_tool_id_idx" ON "tool_usage_log" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "tool_usage_log_user_id_idx" ON "tool_usage_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_user_id_idx" ON "transactions" USING btree ("user_id");