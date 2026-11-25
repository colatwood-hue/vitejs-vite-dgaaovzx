ALTER TABLE "audio_assets" ALTER COLUMN "data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "issue_assets" ALTER COLUMN "data" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "issue_assets" ADD COLUMN "storage_key" text;--> statement-breakpoint
ALTER TABLE "audio_assets" ADD CONSTRAINT "audio_assets_location_chk" CHECK ("data" IS NOT NULL OR "storage_key" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "issue_assets" ADD CONSTRAINT "issue_assets_location_chk" CHECK ("data" IS NOT NULL OR "storage_key" IS NOT NULL);
