CREATE TYPE "public"."entry_strength" AS ENUM('soft', 'hard');--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"core_desire" text DEFAULT '' NOT NULL,
	"external_goal" text DEFAULT '' NOT NULL,
	"internal_need" text DEFAULT '' NOT NULL,
	"behavior_constraints" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_bible_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"entry_type" varchar(40) NOT NULL,
	"name" varchar(200) NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"strength" "entry_strength" DEFAULT 'soft' NOT NULL,
	"source_type" varchar(30) DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_bible_entries" ADD CONSTRAINT "story_bible_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "characters_project_name_idx" ON "characters" USING btree ("project_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "story_bible_project_type_name_idx" ON "story_bible_entries" USING btree ("project_id","entry_type","name");