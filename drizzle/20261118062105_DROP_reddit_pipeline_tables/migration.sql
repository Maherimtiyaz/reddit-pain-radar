-- ⚠️ DESTRUCTIVE: drops the retired Reddit pipeline tables (subreddits,
-- keyword_sets, raw_posts, pain_signals, reports) and their data. PainProof
-- does not use them. Back up first if you want to keep that data:
--   pg_dump --data-only -t subreddits -t keyword_sets -t raw_posts -t pain_signals -t reports "$DATABASE_ADMIN_URL" > reddit-backup.sql
DROP POLICY "tenant_isolation" ON "keyword_sets";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "reports";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "subreddits";--> statement-breakpoint
ALTER TABLE "pain_signals" DROP CONSTRAINT "pain_signals_raw_post_id_raw_posts_id_fkey";--> statement-breakpoint
ALTER TABLE "reports" DROP CONSTRAINT "reports_keyword_set_id_keyword_sets_id_fkey";--> statement-breakpoint
DROP TABLE "keyword_sets";--> statement-breakpoint
DROP TABLE "pain_signals";--> statement-breakpoint
DROP TABLE "raw_posts";--> statement-breakpoint
DROP TABLE "reports";--> statement-breakpoint
DROP TABLE "subreddits";--> statement-breakpoint
DROP TYPE "report_status";