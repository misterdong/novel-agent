CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'accepted', 'rejected', 'superseded');--> statement-breakpoint
CREATE TABLE "chapter_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"manuscript_version_id" uuid NOT NULL,
	"short_summary" text NOT NULL,
	"detailed_summary" text NOT NULL,
	"open_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "state_change_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"manuscript_version_id" uuid NOT NULL,
	"proposal_type" varchar(40) NOT NULL,
	"predicate" varchar(80) NOT NULL,
	"new_value" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_chapter_id" uuid NOT NULL,
	"predicate" varchar(80) NOT NULL,
	"value" jsonb NOT NULL,
	"source_proposal_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chapter_summaries" ADD CONSTRAINT "chapter_summaries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_summaries" ADD CONSTRAINT "chapter_summaries_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chapter_summaries" ADD CONSTRAINT "chapter_summaries_manuscript_version_id_manuscript_versions_id_fk" FOREIGN KEY ("manuscript_version_id") REFERENCES "public"."manuscript_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_change_proposals" ADD CONSTRAINT "state_change_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_change_proposals" ADD CONSTRAINT "state_change_proposals_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_change_proposals" ADD CONSTRAINT "state_change_proposals_manuscript_version_id_manuscript_versions_id_fk" FOREIGN KEY ("manuscript_version_id") REFERENCES "public"."manuscript_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_facts" ADD CONSTRAINT "story_facts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_facts" ADD CONSTRAINT "story_facts_source_chapter_id_chapters_id_fk" FOREIGN KEY ("source_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_facts" ADD CONSTRAINT "story_facts_source_proposal_id_state_change_proposals_id_fk" FOREIGN KEY ("source_proposal_id") REFERENCES "public"."state_change_proposals"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chapter_summaries_version_idx" ON "chapter_summaries" USING btree ("manuscript_version_id");