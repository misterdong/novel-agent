CREATE TYPE "public"."foreshadowing_placement_status" AS ENUM('planned', 'assigned', 'written', 'verified', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."foreshadowing_status" AS ENUM('planned', 'active', 'revealed', 'paid_off', 'abandoned');--> statement-breakpoint
-- 新伏笔模型不兼容旧字段；按产品决策清空旧伏笔及其正文出现记录。
TRUNCATE TABLE "foreshadowings" CASCADE;--> statement-breakpoint
CREATE TABLE "foreshadowing_placements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"foreshadowing_id" uuid NOT NULL,
	"volume_id" uuid NOT NULL,
	"chapter_id" uuid,
	"position" integer NOT NULL,
	"placement_type" varchar(30) NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"narrative_intent" text DEFAULT '' NOT NULL,
	"allowed_information" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"forbidden_information" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "foreshadowing_placement_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "foreshadowings" DROP CONSTRAINT "foreshadowings_planned_resolution_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "foreshadowings" DROP CONSTRAINT "foreshadowings_actual_resolution_chapter_id_chapters_id_fk";
--> statement-breakpoint
ALTER TABLE "foreshadowings" ALTER COLUMN "importance" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "foreshadowings" ALTER COLUMN "importance" SET DEFAULT 'supporting';--> statement-breakpoint
ALTER TABLE "foreshadowing_occurrences" ADD COLUMN "placement_id" uuid;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD COLUMN "truth" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD COLUMN "hidden_information" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD COLUMN "purpose" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD COLUMN "reveal_pattern" varchar(40) DEFAULT 'progressive' NOT NULL;--> statement-breakpoint
ALTER TABLE "foreshadowings" ADD COLUMN "status" "foreshadowing_status" DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE "foreshadowing_placements" ADD CONSTRAINT "foreshadowing_placements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_placements" ADD CONSTRAINT "foreshadowing_placements_foreshadowing_id_foreshadowings_id_fk" FOREIGN KEY ("foreshadowing_id") REFERENCES "public"."foreshadowings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_placements" ADD CONSTRAINT "foreshadowing_placements_volume_id_volumes_id_fk" FOREIGN KEY ("volume_id") REFERENCES "public"."volumes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowing_placements" ADD CONSTRAINT "foreshadowing_placements_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "foreshadowing_placements_thread_position_idx" ON "foreshadowing_placements" USING btree ("foreshadowing_id","position");--> statement-breakpoint
ALTER TABLE "foreshadowing_occurrences" ADD CONSTRAINT "foreshadowing_occurrences_placement_id_foreshadowing_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."foreshadowing_placements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "foreshadowings" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "foreshadowings" DROP COLUMN "foreshadowing_type";--> statement-breakpoint
ALTER TABLE "foreshadowings" DROP COLUMN "state";--> statement-breakpoint
ALTER TABLE "foreshadowings" DROP COLUMN "planned_resolution_chapter_id";--> statement-breakpoint
ALTER TABLE "foreshadowings" DROP COLUMN "actual_resolution_chapter_id";--> statement-breakpoint
DROP TYPE "public"."foreshadowing_state";
