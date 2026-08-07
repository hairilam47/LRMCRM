CREATE TYPE "public"."blast_status" AS ENUM('draft', 'sending', 'completed', 'failed');--> statement-breakpoint
ALTER TYPE "public"."outbox_status" ADD VALUE 'sent' BEFORE 'failed';--> statement-breakpoint
ALTER TYPE "public"."outbox_status" ADD VALUE 'delivered' BEFORE 'failed';--> statement-breakpoint
ALTER TYPE "public"."outbox_status" ADD VALUE 'read' BEFORE 'failed';--> statement-breakpoint
CREATE TABLE "blast_campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"segment" text NOT NULL,
	"body" text NOT NULL,
	"media_url" text,
	"status" "blast_status" DEFAULT 'draft' NOT NULL,
	"audience_size" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"provider_batch_ids" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "wa_consent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "wa_consent_at" timestamp;--> statement-breakpoint
ALTER TABLE "message_outbox" ADD COLUMN "media_url" text;--> statement-breakpoint
ALTER TABLE "message_outbox" ADD COLUMN "to_chat_id" text;--> statement-breakpoint
ALTER TABLE "message_outbox" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "message_outbox" ADD COLUMN "provider_ref" text;--> statement-breakpoint
ALTER TABLE "message_outbox" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "blast_campaigns" ADD CONSTRAINT "blast_campaigns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blast_campaigns" ADD CONSTRAINT "blast_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;