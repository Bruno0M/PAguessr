ALTER TABLE "locations" ADD COLUMN "name" varchar(160);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "history" text;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "category" varchar(80);--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "view_heading" double precision;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "view_pitch" double precision;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "view_fov" double precision;