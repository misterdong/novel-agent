CREATE TYPE "public"."issue_severity" AS ENUM('error', 'warning', 'suggestion');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'fixed', 'ignored', 'false_positive');--> statement-breakpoint
CREATE TABLE "review_issues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"chapter_id" uuid NOT NULL,
	"manuscript_version_id" uuid NOT NULL,
	"review_type" varchar(40) NOT NULL,
	"severity" "issue_severity" NOT NULL,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"code" varchar(80) NOT NULL,
	"title" varchar(200) NOT NULL,
	"explanation" text NOT NULL,
	"location" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggestions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_issues" ADD CONSTRAINT "review_issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_issues" ADD CONSTRAINT "review_issues_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_issues" ADD CONSTRAINT "review_issues_manuscript_version_id_manuscript_versions_id_fk" FOREIGN KEY ("manuscript_version_id") REFERENCES "public"."manuscript_versions"("id") ON DELETE cascade ON UPDATE no action;