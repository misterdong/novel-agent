CREATE TABLE "autopilot_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid,
	"status" varchar(40) DEFAULT 'queued' NOT NULL,
	"scope" varchar(30) DEFAULT 'chapter' NOT NULL,
	"instruction" text DEFAULT '' NOT NULL,
	"target_words" integer DEFAULT 3000 NOT NULL,
	"current_stage" varchar(50) DEFAULT 'queued' NOT NULL,
	"current_scene_index" integer DEFAULT 0 NOT NULL,
	"repair_count" integer DEFAULT 0 NOT NULL,
	"max_repairs" integer DEFAULT 2 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"last_message" text DEFAULT '' NOT NULL,
	"error_message" text DEFAULT '' NOT NULL,
	"result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "autopilot_runs" ADD CONSTRAINT "autopilot_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_runs" ADD CONSTRAINT "autopilot_runs_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;