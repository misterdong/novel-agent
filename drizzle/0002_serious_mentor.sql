CREATE TYPE "public"."scene_status" AS ENUM('draft', 'confirmed', 'writing', 'completed');--> statement-breakpoint
CREATE TABLE "scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" "scene_status" DEFAULT 'draft' NOT NULL,
	"outline" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_words" integer DEFAULT 1000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenes" ADD CONSTRAINT "scenes_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "scenes_chapter_position_idx" ON "scenes" USING btree ("chapter_id","position");