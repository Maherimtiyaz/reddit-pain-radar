ALTER TABLE "idea_checks" ADD COLUMN "stripe_checkout_session_id" text;--> statement-breakpoint
ALTER TABLE "idea_checks" ADD COLUMN "paid_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "idea_checks" ADD CONSTRAINT "idea_checks_stripe_checkout_session_id_key" UNIQUE("stripe_checkout_session_id");