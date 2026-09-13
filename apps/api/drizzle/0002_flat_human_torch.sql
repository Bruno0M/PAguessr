ALTER TABLE "games" ADD COLUMN "user_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_user_id_idx" ON "games" USING btree ("user_id");