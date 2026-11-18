CREATE TYPE "public"."ai_message_role" AS ENUM('founder', 'assistant', 'system_note');--> statement-breakpoint
CREATE TYPE "public"."ai_stage" AS ENUM('understand', 'interview', 'angles', 'draft', 'critique', 'finalize', 'done');--> statement-breakpoint
CREATE TYPE "public"."campaign_kind" AS ENUM('test', 'broadcast');--> statement-breakpoint
CREATE TYPE "public"."campaign_status" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'partially_failed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."consent_action" AS ENUM('requested', 'granted', 'confirmed', 'withdrawn', 'imported');--> statement-breakpoint
CREATE TYPE "public"."consent_type" AS ENUM('express', 'implied');--> statement-breakpoint
CREATE TYPE "public"."idea_stage" AS ENUM('captured', 'exploring', 'ready_to_draft', 'drafting', 'editing', 'scheduled', 'published');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('draft', 'approved', 'scheduled', 'sent', 'published');--> statement-breakpoint
CREATE TYPE "public"."privacy_level" AS ENUM('private', 'sensitive', 'shareable');--> statement-breakpoint
CREATE TYPE "public"."send_status" AS ENUM('queued', 'sent', 'simulated', 'failed', 'delivered', 'bounced', 'complained', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('pending', 'active', 'unsubscribed', 'bounced', 'complained');--> statement-breakpoint
CREATE TYPE "public"."thought_source" AS ENUM('note', 'journal', 'voice', 'audio_upload', 'quote', 'link', 'question', 'observation', 'story', 'lesson', 'concept');--> statement-breakpoint
CREATE TYPE "public"."thought_status" AS ENUM('new', 'reviewed', 'used', 'archived');--> statement-breakpoint
CREATE TYPE "public"."transcription_status" AS ENUM('not_needed', 'pending', 'completed', 'failed', 'unconfigured');--> statement-breakpoint
CREATE TABLE "ai_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" "ai_message_role" NOT NULL,
	"kind" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"data" jsonb,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"idea_id" uuid NOT NULL,
	"issue_id" uuid,
	"stage" "ai_stage" DEFAULT 'understand' NOT NULL,
	"selected_angle" jsonb,
	"interview_rounds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audio_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"duration_seconds" integer,
	"original_filename" text,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"kind" "campaign_kind" NOT NULL,
	"status" "campaign_status" DEFAULT 'draft' NOT NULL,
	"provider" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"segment_tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"subject" text NOT NULL,
	"preview_text" text DEFAULT '' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"confirmed_by" uuid,
	"confirmation_note" text DEFAULT '' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"last_error" text,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"action" "consent_action" NOT NULL,
	"consent_type" "consent_type" DEFAULT 'express' NOT NULL,
	"source" text NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engagement_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider_event_id" text,
	"send_event_id" uuid,
	"campaign_id" uuid,
	"type" text NOT NULL,
	"url" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"raw" jsonb,
	CONSTRAINT "engagement_events_provider_event_id_unique" UNIQUE("provider_event_id")
);
--> statement-breakpoint
CREATE TABLE "idea_links" (
	"idea_id" uuid NOT NULL,
	"related_idea_id" uuid NOT NULL,
	CONSTRAINT "idea_links_idea_id_related_idea_id_pk" PRIMARY KEY("idea_id","related_idea_id")
);
--> statement-breakpoint
CREATE TABLE "idea_thoughts" (
	"idea_id" uuid NOT NULL,
	"thought_id" uuid NOT NULL,
	CONSTRAINT "idea_thoughts_idea_id_thought_id_pk" PRIMARY KEY("idea_id","thought_id")
);
--> statement-breakpoint
CREATE TABLE "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"concept_number" text,
	"working_title" text NOT NULL,
	"thesis" text DEFAULT '' NOT NULL,
	"primary_pillar_id" integer,
	"stage" "idea_stage" DEFAULT 'captured' NOT NULL,
	"supporting_stories" text DEFAULT '' NOT NULL,
	"personal_experiences" text DEFAULT '' NOT NULL,
	"questions" text DEFAULT '' NOT NULL,
	"references" text DEFAULT '' NOT NULL,
	"audience_relevance" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"target_date" date,
	"archived_at" timestamp with time zone,
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_status" (
	"key" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"alt_text" text DEFAULT '' NOT NULL,
	"data" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"source" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"recommendation_md" text DEFAULT '' NOT NULL,
	"closing_md" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"preview_text" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" integer,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text DEFAULT '' NOT NULL,
	"idea_id" uuid,
	"primary_pillar_id" integer,
	"secondary_themes" text[] DEFAULT '{}'::text[] NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"recommendation_md" text DEFAULT '' NOT NULL,
	"closing_md" text DEFAULT '' NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"preview_text" text DEFAULT '' NOT NULL,
	"status" "issue_status" DEFAULT 'draft' NOT NULL,
	"approved_at" timestamp with time zone,
	"approved_hash" text,
	"published_at" timestamp with time zone,
	"reading_minutes" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issues_number_unique" UNIQUE("number"),
	CONSTRAINT "issues_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"kind" text DEFAULT 'view' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pillars" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "pillars_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "publication_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name" text DEFAULT 'The Dash' NOT NULL,
	"tagline" text DEFAULT 'A letter about life, becoming, and everything in between.' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"parent_brand" text DEFAULT 'Who Is Col' NOT NULL,
	"author_name" text DEFAULT 'Col Atwood' NOT NULL,
	"author_bio_short" text DEFAULT '' NOT NULL,
	"about_md" text DEFAULT '' NOT NULL,
	"sender_name" text DEFAULT 'Col from The Dash' NOT NULL,
	"sender_email" text DEFAULT '' NOT NULL,
	"reply_to_email" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"mailing_address" text DEFAULT '' NOT NULL,
	"double_opt_in" boolean DEFAULT true NOT NULL,
	"signup_enabled" boolean DEFAULT true NOT NULL,
	"voice_guidelines" text DEFAULT '' NOT NULL,
	"privacy_policy_md" text DEFAULT '' NOT NULL,
	"privacy_reviewed" boolean DEFAULT false NOT NULL,
	"onboarding" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reader_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid,
	"kind" text NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"content" text NOT NULL,
	"follow_up" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repurposed_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"generated_by" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "send_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"subscriber_id" uuid,
	"email" text NOT NULL,
	"status" "send_status" DEFAULT 'queued' NOT NULL,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber_preferences" (
	"subscriber_id" uuid PRIMARY KEY NOT NULL,
	"newsletter" boolean DEFAULT true NOT NULL,
	"occasional_updates" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"status" "subscriber_status" DEFAULT 'pending' NOT NULL,
	"consent_source" text NOT NULL,
	"consent_type" "consent_type" DEFAULT 'express' NOT NULL,
	"consent_at" timestamp with time zone,
	"consent_evidence" text DEFAULT '' NOT NULL,
	"consent_expires_at" timestamp with time zone,
	"confirm_token_hash" text,
	"confirm_sent_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"manage_token" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"is_test_recipient" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_email_unique" UNIQUE("email"),
	CONSTRAINT "subscribers_manage_token_unique" UNIQUE("manage_token")
);
--> statement-breakpoint
CREATE TABLE "suppressions" (
	"email" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "thought_pillars" (
	"thought_id" uuid NOT NULL,
	"pillar_id" integer NOT NULL,
	CONSTRAINT "thought_pillars_thought_id_pillar_id_pk" PRIMARY KEY("thought_id","pillar_id")
);
--> statement-breakpoint
CREATE TABLE "thoughts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_type" "thought_source" DEFAULT 'note' NOT NULL,
	"title" text,
	"original_content" text DEFAULT '' NOT NULL,
	"source_url" text,
	"audio_asset_id" uuid,
	"transcription" text,
	"transcription_status" "transcription_status" DEFAULT 'not_needed' NOT NULL,
	"transcription_error" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" "thought_status" DEFAULT 'new' NOT NULL,
	"privacy" "privacy_level" DEFAULT 'private' NOT NULL,
	"ai_analysis" jsonb,
	"ai_analyzed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_session_id_ai_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."ai_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_sessions" ADD CONSTRAINT "ai_sessions_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_send_event_id_send_events_id_fk" FOREIGN KEY ("send_event_id") REFERENCES "public"."send_events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_links" ADD CONSTRAINT "idea_links_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_links" ADD CONSTRAINT "idea_links_related_idea_id_ideas_id_fk" FOREIGN KEY ("related_idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_thoughts" ADD CONSTRAINT "idea_thoughts_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea_thoughts" ADD CONSTRAINT "idea_thoughts_thought_id_thoughts_id_fk" FOREIGN KEY ("thought_id") REFERENCES "public"."thoughts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ideas" ADD CONSTRAINT "ideas_primary_pillar_id_pillars_id_fk" FOREIGN KEY ("primary_pillar_id") REFERENCES "public"."pillars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_assets" ADD CONSTRAINT "issue_assets_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_revisions" ADD CONSTRAINT "issue_revisions_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_idea_id_ideas_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."ideas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_primary_pillar_id_pillars_id_fk" FOREIGN KEY ("primary_pillar_id") REFERENCES "public"."pillars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reader_feedback" ADD CONSTRAINT "reader_feedback_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repurposed_content" ADD CONSTRAINT "repurposed_content_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_events" ADD CONSTRAINT "send_events_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_events" ADD CONSTRAINT "send_events_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_preferences" ADD CONSTRAINT "subscriber_preferences_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thought_pillars" ADD CONSTRAINT "thought_pillars_thought_id_thoughts_id_fk" FOREIGN KEY ("thought_id") REFERENCES "public"."thoughts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thought_pillars" ADD CONSTRAINT "thought_pillars_pillar_id_pillars_id_fk" FOREIGN KEY ("pillar_id") REFERENCES "public"."pillars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "thoughts" ADD CONSTRAINT "thoughts_audio_asset_id_audio_assets_id_fk" FOREIGN KEY ("audio_asset_id") REFERENCES "public"."audio_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_messages_session_idx" ON "ai_messages" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "campaigns_status_idx" ON "campaigns" USING btree ("status","scheduled_for");--> statement-breakpoint
CREATE INDEX "consent_records_subscriber_idx" ON "consent_records" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "engagement_campaign_idx" ON "engagement_events" USING btree ("campaign_id","type");--> statement-breakpoint
CREATE INDEX "ideas_stage_idx" ON "ideas" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "issue_revisions_issue_idx" ON "issue_revisions" USING btree ("issue_id","created_at");--> statement-breakpoint
CREATE INDEX "issues_published_idx" ON "issues" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "page_views_created_idx" ON "page_views" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "send_events_campaign_email_uq" ON "send_events" USING btree ("campaign_id","email");--> statement-breakpoint
CREATE INDEX "send_events_provider_msg_idx" ON "send_events" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscribers_status_idx" ON "subscribers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "thoughts_created_idx" ON "thoughts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "thoughts_status_idx" ON "thoughts" USING btree ("status");