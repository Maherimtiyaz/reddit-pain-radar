CREATE TYPE "weekly_issue_status" AS ENUM('draft', 'published');--> statement-breakpoint
CREATE TABLE "weekly_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"slug" text NOT NULL UNIQUE,
	"status" "weekly_issue_status" DEFAULT 'draft'::"weekly_issue_status" NOT NULL,
	"title" text NOT NULL,
	"content" jsonb NOT NULL,
	"markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "weekly_issues_status_idx" ON "weekly_issues" ("status");