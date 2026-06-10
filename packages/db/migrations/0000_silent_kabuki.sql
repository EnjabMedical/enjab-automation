CREATE TYPE "public"."channel" AS ENUM('whatsapp', 'sms', 'email', 'internal');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('pending', 'running', 'completed', 'failed', 'expired', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."message_direction" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."message_status" AS ENUM('queued', 'sent', 'delivered', 'read', 'failed');--> statement-breakpoint
CREATE TYPE "public"."opt_out_source" AS ENUM('stop', 'meta_block', 'manual');--> statement-breakpoint
CREATE TYPE "public"."rating_mode" AS ENUM('a1', 'a2', 'b');--> statement-breakpoint
CREATE TYPE "public"."thread_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('new', 'claimed', 'in_progress', 'completed', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'staff');--> statement-breakpoint
CREATE TYPE "public"."visit_type" AS ENUM('o', 'i');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "automations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"paused_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bills" (
	"bill_no" text PRIMARY KEY NOT NULL,
	"mr_no" text NOT NULL,
	"visit_id" text,
	"visit_type" "visit_type" NOT NULL,
	"open_date" timestamp with time zone NOT NULL,
	"bill_status" text,
	"raw_json" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "events" (
	"id" text PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "login_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text,
	"target_key" text,
	"mr_no" text,
	"direction" "message_direction" NOT NULL,
	"channel" "channel" NOT NULL,
	"wa_msg_id" text,
	"template_name" text,
	"status" "message_status" DEFAULT 'queued' NOT NULL,
	"status_ts" timestamp with time zone DEFAULT now() NOT NULL,
	"body" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "opt_outs" (
	"phone" text PRIMARY KEY NOT NULL,
	"source" "opt_out_source" NOT NULL,
	"reason" text,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"actor" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "patients" (
	"mr_no" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"raw_json" jsonb,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rating_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"rating_id" text NOT NULL,
	"status" "ticket_status" DEFAULT 'new' NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_tickets_rating_id_unique" UNIQUE("rating_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ratings" (
	"id" text PRIMARY KEY NOT NULL,
	"bill_no" text NOT NULL,
	"score" integer NOT NULL,
	"comment" text,
	"mode" "rating_mode" NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_bill_no_unique" UNIQUE("bill_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "scheduled_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"automation_id" text NOT NULL,
	"target_key" text NOT NULL,
	"fire_at" timestamp with time zone NOT NULL,
	"status" "job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" text,
	"ua" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "threads" (
	"id" text PRIMARY KEY NOT NULL,
	"mr_no" text NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"claimed_by" text,
	"status" "thread_status" DEFAULT 'open' NOT NULL,
	CONSTRAINT "threads_mr_no_unique" UNIQUE("mr_no")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" "user_role" DEFAULT 'staff' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bills" ADD CONSTRAINT "bills_mr_no_patients_mr_no_fk" FOREIGN KEY ("mr_no") REFERENCES "public"."patients"("mr_no") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "messages" ADD CONSTRAINT "messages_mr_no_patients_mr_no_fk" FOREIGN KEY ("mr_no") REFERENCES "public"."patients"("mr_no") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rating_tickets" ADD CONSTRAINT "rating_tickets_rating_id_ratings_id_fk" FOREIGN KEY ("rating_id") REFERENCES "public"."ratings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rating_tickets" ADD CONSTRAINT "rating_tickets_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ratings" ADD CONSTRAINT "ratings_bill_no_bills_bill_no_fk" FOREIGN KEY ("bill_no") REFERENCES "public"."bills"("bill_no") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "scheduled_jobs" ADD CONSTRAINT "scheduled_jobs_automation_id_automations_id_fk" FOREIGN KEY ("automation_id") REFERENCES "public"."automations"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "threads" ADD CONSTRAINT "threads_mr_no_patients_mr_no_fk" FOREIGN KEY ("mr_no") REFERENCES "public"."patients"("mr_no") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "threads" ADD CONSTRAINT "threads_claimed_by_users_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bills_mr_no_idx" ON "bills" USING btree ("mr_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bills_open_date_idx" ON "bills" USING btree ("open_date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_ts_idx" ON "events" USING btree ("ts");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_target_idx" ON "events" USING btree ("target");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "messages_wa_msg_id_uq" ON "messages" USING btree ("wa_msg_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_mr_no_idx" ON "messages" USING btree ("mr_no");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_target_key_idx" ON "messages" USING btree ("target_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ratings_score_idx" ON "ratings" USING btree ("score");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "scheduled_jobs_automation_target_uq" ON "scheduled_jobs" USING btree ("automation_id","target_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_jobs_fire_at_idx" ON "scheduled_jobs" USING btree ("fire_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "scheduled_jobs_status_idx" ON "scheduled_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "threads_last_message_idx" ON "threads" USING btree ("last_message_at");