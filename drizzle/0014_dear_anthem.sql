CREATE TABLE "storyline_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"storyline_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"entry_condition" text DEFAULT '' NOT NULL,
	"result" text DEFAULT '' NOT NULL,
	"status" varchar(30) DEFAULT 'planned' NOT NULL,
	"position" integer NOT NULL,
	"planned_volume_id" uuid,
	"planned_chapter_id" uuid,
	"actual_chapter_id" uuid,
	"participant_character_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"state_changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "storylines" ADD COLUMN "core_question" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "storylines" ADD COLUMN "initial_state" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "storylines" ADD COLUMN "target_outcome" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "storylines" ADD COLUMN "core_conflict" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "storylines" ADD COLUMN "current_progress" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "storylines" ADD COLUMN "next_plan" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "storylines" ADD COLUMN "completion_criteria" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "storylines" ADD COLUMN "priority" varchar(20) DEFAULT 'important' NOT NULL;--> statement-breakpoint
ALTER TABLE "storylines" ADD COLUMN "start_volume_id" uuid;--> statement-breakpoint
ALTER TABLE "storylines" ADD COLUMN "end_volume_id" uuid;--> statement-breakpoint
ALTER TABLE "storylines" ADD COLUMN "related_character_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "storyline_nodes" ADD CONSTRAINT "storyline_nodes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyline_nodes" ADD CONSTRAINT "storyline_nodes_storyline_id_storylines_id_fk" FOREIGN KEY ("storyline_id") REFERENCES "public"."storylines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyline_nodes" ADD CONSTRAINT "storyline_nodes_planned_volume_id_volumes_id_fk" FOREIGN KEY ("planned_volume_id") REFERENCES "public"."volumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyline_nodes" ADD CONSTRAINT "storyline_nodes_planned_chapter_id_chapters_id_fk" FOREIGN KEY ("planned_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storyline_nodes" ADD CONSTRAINT "storyline_nodes_actual_chapter_id_chapters_id_fk" FOREIGN KEY ("actual_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "storyline_nodes_line_position_idx" ON "storyline_nodes" USING btree ("storyline_id","position");--> statement-breakpoint
ALTER TABLE "storylines" ADD CONSTRAINT "storylines_start_volume_id_volumes_id_fk" FOREIGN KEY ("start_volume_id") REFERENCES "public"."volumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storylines" ADD CONSTRAINT "storylines_end_volume_id_volumes_id_fk" FOREIGN KEY ("end_volume_id") REFERENCES "public"."volumes"("id") ON DELETE set null ON UPDATE no action;