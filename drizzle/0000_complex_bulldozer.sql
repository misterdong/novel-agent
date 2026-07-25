CREATE TYPE "public"."chapter_status" AS ENUM('draft', 'confirmed', 'writing', 'completed');--> statement-breakpoint
CREATE TYPE "public"."generation_status" AS ENUM('queued', 'running', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('active', 'archived', 'trashed');--> statement-breakpoint
CREATE TABLE "chapters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"volume_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"status" "chapter_status" DEFAULT 'draft' NOT NULL,
	"outline" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"target_words" integer DEFAULT 3000 NOT NULL,
	"current_words" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid,
	"task_type" varchar(80) NOT NULL,
	"status" "generation_status" DEFAULT 'queued' NOT NULL,
	"user_instruction" text DEFAULT '' NOT NULL,
	"input_manifest" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parsed_output" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manuscript_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chapter_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"content_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_text" text DEFAULT '' NOT NULL,
	"word_count" integer DEFAULT 0 NOT NULL,
	"source_type" varchar(30) DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(200) NOT NULL,
	"genre" varchar(100) NOT NULL,
	"status" "project_status" DEFAULT 'active' NOT NULL,
	"target_words" integer DEFAULT 500000 NOT NULL,
	"target_chapters" integer DEFAULT 200 NOT NULL,
	"narrative_pov" varchar(50) DEFAULT '第三人称限知' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "volumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"position" integer NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_volume_id_volumes_id_fk" FOREIGN KEY ("volume_id") REFERENCES "public"."volumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manuscript_versions" ADD CONSTRAINT "manuscript_versions_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chapters_volume_position_idx" ON "chapters" USING btree ("volume_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "manuscript_chapter_version_idx" ON "manuscript_versions" USING btree ("chapter_id","version_no");--> statement-breakpoint
CREATE UNIQUE INDEX "volumes_project_position_idx" ON "volumes" USING btree ("project_id","position");