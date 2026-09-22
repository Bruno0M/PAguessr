CREATE TABLE "championship_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"championship_id" uuid NOT NULL,
	"phase" integer NOT NULL,
	"slot" integer NOT NULL,
	"player_a_id" uuid,
	"player_b_id" uuid,
	"game_a_id" uuid,
	"game_b_id" uuid,
	"score_a" integer,
	"score_b" integer,
	"winner_id" uuid,
	"opens_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "championship_matches_championship_id_phase_slot_unique" UNIQUE("championship_id","phase","slot")
);
--> statement-breakpoint
CREATE TABLE "championship_participants" (
	"championship_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"seed" integer,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"eliminated_in_phase" integer,
	CONSTRAINT "championship_participants_championship_id_user_id_pk" PRIMARY KEY("championship_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "championships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(80) NOT NULL,
	"description" text,
	"banner_url" text,
	"max_participants" integer NOT NULL,
	"rounds_per_match" integer NOT NULL,
	"round_duration_seconds" integer DEFAULT 60 NOT NULL,
	"phase_interval_seconds" integer NOT NULL,
	"status" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"seeded_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "championship_match_id" uuid;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "duration_seconds" integer DEFAULT 60 NOT NULL;--> statement-breakpoint
ALTER TABLE "championship_matches" ADD CONSTRAINT "championship_matches_championship_id_championships_id_fk" FOREIGN KEY ("championship_id") REFERENCES "public"."championships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_matches" ADD CONSTRAINT "championship_matches_player_a_id_users_id_fk" FOREIGN KEY ("player_a_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_matches" ADD CONSTRAINT "championship_matches_player_b_id_users_id_fk" FOREIGN KEY ("player_b_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_matches" ADD CONSTRAINT "championship_matches_game_a_id_games_id_fk" FOREIGN KEY ("game_a_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_matches" ADD CONSTRAINT "championship_matches_game_b_id_games_id_fk" FOREIGN KEY ("game_b_id") REFERENCES "public"."games"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_matches" ADD CONSTRAINT "championship_matches_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_participants" ADD CONSTRAINT "championship_participants_championship_id_championships_id_fk" FOREIGN KEY ("championship_id") REFERENCES "public"."championships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championship_participants" ADD CONSTRAINT "championship_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "championships" ADD CONSTRAINT "championships_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "championship_participants_championship_id_idx" ON "championship_participants" USING btree ("championship_id");--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_championship_match_id_championship_matches_id_fk" FOREIGN KEY ("championship_match_id") REFERENCES "public"."championship_matches"("id") ON DELETE cascade ON UPDATE no action;