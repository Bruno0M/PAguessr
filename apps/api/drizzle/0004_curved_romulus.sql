CREATE TABLE "streetview_panorama_usage" (
	"year_month" text PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "streetview_mode" text DEFAULT 'static' NOT NULL;