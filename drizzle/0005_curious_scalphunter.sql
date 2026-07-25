CREATE TYPE "public"."foreshadowing_state" AS ENUM('planned', 'planted', 'reinforced', 'misdirected', 'resolved', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."knowledge_state" AS ENUM('knows', 'believes', 'suspects', 'does_not_know');--> statement-breakpoint
CREATE TABLE "character_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"proposition" text NOT NULL,
	"state" "knowledge_state" NOT NULL,
	"source_chapter_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foreshadowing_occurrences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"foreshadowing_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"scene_id" uuid,
	"action" varchar(30) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "foreshadowings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"foreshadowing_type" varchar(40) DEFAULT 'mystery' NOT NULL,
	"state" "foreshadowing_state" DEFAULT 'planned' NOT NULL,
	"importance" integer DEFAULT 3 NOT NULL,
	"planned_resolution_chapter_id" uuid,
	"actual_resolution_chapter_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"time_kind" varchar(30) DEFAULT 'relative' NOT NULL,
	"relative_day" integer,
	"location_name" varchar(200) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_knowledge" ADD CONSTRAINT "character_knowledge_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_knowledge" ADD CONSTRAINT "character_knowledge_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_knowledge" ADD CONSTRAINT "character_knowledge_source_chapter_id_chapters_id_fk" FOREIGN KEY ("source_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_occurrences" ADD CONSTRAINT "foreshadowing_occurrences_foreshadowing_id_foreshadowings_id_fk" FOREIGN KEY ("foreshadowing_id") REFERENCES "public"."foreshadowings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_occurrences" ADD CONSTRAINT "foreshadowing_occurrences_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_occurrences" ADD CONSTRAINT "foreshadowing_occurrences_scene_id_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD CONSTRAINT "foreshadowings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD CONSTRAINT "foreshadowings_planned_resolution_chapter_id_chapters_id_fk" FOREIGN KEY ("planned_resolution_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD CONSTRAINT "foreshadowings_actual_resolution_chapter_id_chapters_id_fk" FOREIGN KEY ("actual_resolution_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_events" ADD CONSTRAINT "timeline_events_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;