CREATE TABLE "watch_topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"org_id" uuid NOT NULL,
	"topic" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone,
	CONSTRAINT "watch_topics_org_id_topic_key" UNIQUE("org_id","topic")
);
--> statement-breakpoint
ALTER TABLE "watch_topics" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "idea_checks" ADD COLUMN "org_id" uuid;--> statement-breakpoint
CREATE INDEX "idea_checks_org_id_created_at_idx" ON "idea_checks" ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "watch_topics_org_id_idx" ON "watch_topics" ("org_id");--> statement-breakpoint
ALTER TABLE "idea_checks" ADD CONSTRAINT "idea_checks_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "watch_topics" ADD CONSTRAINT "watch_topics_org_id_orgs_id_fkey" FOREIGN KEY ("org_id") REFERENCES "orgs"("id") ON DELETE CASCADE;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "watch_topics" AS PERMISSIVE FOR ALL TO public USING (org_id = current_setting('app.current_org_id', true)::uuid) WITH CHECK (org_id = current_setting('app.current_org_id', true)::uuid);