CREATE TYPE "plan" AS ENUM('trial', 'starter', 'pro');--> statement-breakpoint
CREATE TYPE "report_status" AS ENUM('queued', 'running', 'complete', 'failed');--> statement-breakpoint
CREATE TYPE "role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_id" uuid NOT NULL,
	"key_hash" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "keyword_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"keywords" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keyword_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid,
	"org_id" uuid,
	"role" "role" DEFAULT 'member'::"role" NOT NULL,
	CONSTRAINT "memberships_pkey" PRIMARY KEY("user_id","org_id")
);
--> statement-breakpoint
ALTER TABLE "memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"stripe_customer_id" text UNIQUE,
	"plan" "plan" DEFAULT 'trial'::"plan" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orgs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pain_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"raw_post_id" uuid NOT NULL,
	"theme" text NOT NULL,
	"verbatim_quote" text NOT NULL,
	"urgency_score" real,
	"wtp_score" real,
	"composite_score" real,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"subreddit" text NOT NULL,
	"reddit_id" text NOT NULL UNIQUE,
	"title" text NOT NULL,
	"body" text,
	"author" text,
	"score" integer DEFAULT 0 NOT NULL,
	"num_comments" integer DEFAULT 0 NOT NULL,
	"created_utc" timestamp with time zone NOT NULL,
	"url" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_id" uuid NOT NULL,
	"subreddit_ids" uuid[],
	"keyword_set_id" uuid,
	"status" "report_status" DEFAULT 'queued'::"report_status" NOT NULL,
	"markdown_content" text,
	"json_content" jsonb,
	"generated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subreddits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subreddits_org_id_name_key" UNIQUE("org_id","name")
);
--> statement-breakpoint
ALTER TABLE "subreddits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"email" text NOT NULL UNIQUE,
	"name" text,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "api_keys_org_id_idx" ON "api_keys" ("org_id");--> statement-breakpoint
CREATE INDEX "keyword_sets_org_id_idx" ON "keyword_sets" ("org_id");--> statement-breakpoint
CREATE INDEX "memberships_org_id_idx" ON "memberships" ("org_id");--> statement-breakpoint
CREATE INDEX "pain_signals_raw_post_id_idx" ON "pain_signals" ("raw_post_id");--> statement-breakpoint
CREATE INDEX "raw_posts_subreddit_idx" ON "raw_posts" ("subreddit");--> statement-breakpoint
CREATE INDEX "raw_posts_created_utc_idx" ON "raw_posts" ("created_utc");--> statement-breakpoint
CREATE INDEX "reports_org_id_idx" ON "reports" ("org_id");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" ("status");--> statement-breakpoint
CREATE INDEX "subreddits_org_id_idx" ON "subreddits" ("org_id");--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "keyword_sets" ADD CONSTRAINT "keyword_sets_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "pain_signals" ADD CONSTRAINT "pain_signals_raw_post_id_raw_posts_id_fkey" FOREIGN KEY ("raw_post_id") REFERENCES "raw_posts"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_keyword_set_id_keyword_sets_id_fkey" FOREIGN KEY ("keyword_set_id") REFERENCES "keyword_sets"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "subreddits" ADD CONSTRAINT "subreddits_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "api_keys" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "keyword_sets" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "memberships" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "orgs" AS PERMISSIVE FOR ALL TO public USING (id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "reports" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "subreddits" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);