CREATE TYPE "idea_check_status" AS ENUM('pending_payment', 'queued', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TABLE "idea_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"idea" text NOT NULL,
	"email" text,
	"status" "idea_check_status" DEFAULT 'queued'::"idea_check_status" NOT NULL,
	"access_token_hash" text NOT NULL,
	"origin" text DEFAULT 'cli' NOT NULL,
	"score" integer,
	"verdict" text,
	"result" jsonb,
	"markdown" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idea_checks_status_idx" ON "idea_checks" ("status");--> statement-breakpoint
CREATE INDEX "idea_checks_email_idx" ON "idea_checks" ("email");