CREATE TABLE "planning_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"cycle_number" integer NOT NULL,
	"trigger_type" varchar(40) DEFAULT 'manual' NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"current_stage" varchar(50) DEFAULT 'planning' NOT NULL,
	"planning_horizon" jsonb DEFAULT '{"detailedVolumes":1,"previewVolumes":1,"detailedChapters":5}'::jsonb NOT NULL,
	"input_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"validation_result" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_arcs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"planning_cycle_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"objective" text DEFAULT '' NOT NULL,
	"central_conflict" text DEFAULT '' NOT NULL,
	"entry_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"exit_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ending_direction" text DEFAULT '' NOT NULL,
	"future_directions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_state_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"planning_cycle_id" uuid NOT NULL,
	"snapshot_type" varchar(40) DEFAULT 'cycle_start' NOT NULL,
	"character_states" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"relationship_states" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"world_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"storyline_states" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"foreshadowing_states" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"knowledge_states" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resource_states" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unresolved_conflicts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reader_promises" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recent_events" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "foreshadowing_placements" ADD COLUMN "planning_cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "foreshadowing_placements" ADD COLUMN "planning_status" varchar(30) DEFAULT 'candidate' NOT NULL;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD COLUMN "commitment_level" varchar(30) DEFAULT 'candidate' NOT NULL;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD COLUMN "target_payoff_stage" varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD COLUMN "earliest_reveal_stage" varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD COLUMN "latest_payoff_stage" varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD COLUMN "planning_notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "storyline_nodes" ADD COLUMN "narrative_status" varchar(30) DEFAULT 'candidate' NOT NULL;--> statement-breakpoint
ALTER TABLE "storylines" ADD COLUMN "narrative_status" varchar(30) DEFAULT 'candidate' NOT NULL;--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "planning_cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "story_arc_id" uuid;--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "planning_status" varchar(30) DEFAULT 'confirmed' NOT NULL;--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "confidence" integer DEFAULT 70 NOT NULL;--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "locked_fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "planning_cycles" ADD CONSTRAINT "planning_cycles_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_arcs" ADD CONSTRAINT "story_arcs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_arcs" ADD CONSTRAINT "story_arcs_planning_cycle_id_planning_cycles_id_fk" FOREIGN KEY ("planning_cycle_id") REFERENCES "public"."planning_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_state_snapshots" ADD CONSTRAINT "story_state_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_state_snapshots" ADD CONSTRAINT "story_state_snapshots_planning_cycle_id_planning_cycles_id_fk" FOREIGN KEY ("planning_cycle_id") REFERENCES "public"."planning_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "planning_cycles_project_number_idx" ON "planning_cycles" USING btree ("project_id","cycle_number");--> statement-breakpoint
CREATE UNIQUE INDEX "story_arcs_cycle_position_idx" ON "story_arcs" USING btree ("planning_cycle_id","position");--> statement-breakpoint
ALTER TABLE "foreshadowing_placements" ADD CONSTRAINT "foreshadowing_placements_planning_cycle_id_planning_cycles_id_fk" FOREIGN KEY ("planning_cycle_id") REFERENCES "public"."planning_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_planning_cycle_id_planning_cycles_id_fk" FOREIGN KEY ("planning_cycle_id") REFERENCES "public"."planning_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "volumes" ADD CONSTRAINT "volumes_story_arc_id_story_arcs_id_fk" FOREIGN KEY ("story_arc_id") REFERENCES "public"."story_arcs"("id") ON DELETE set null ON UPDATE no action;