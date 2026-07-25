CREATE TABLE "autopilot_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid,
	"stage" varchar(50) NOT NULL,
	"event_type" varchar(50) NOT NULL,
	"level" varchar(20) DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"provider" varchar(80) DEFAULT '' NOT NULL,
	"model" varchar(160) DEFAULT '' NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_micros" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "autopilot_events" ADD CONSTRAINT "autopilot_events_run_id_autopilot_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."autopilot_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_events" ADD CONSTRAINT "autopilot_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autopilot_events" ADD CONSTRAINT "autopilot_events_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;