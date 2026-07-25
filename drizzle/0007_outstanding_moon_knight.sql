CREATE TABLE "plot_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"storyline_id" uuid,
	"volume_id" uuid,
	"chapter_id" uuid,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"cause" text DEFAULT '' NOT NULL,
	"consequence" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storylines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"storyline_type" varchar(40) DEFAULT 'main' NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"status" varchar(30) DEFAULT 'planned' NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plot_events" ADD CONSTRAINT "plot_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_events" ADD CONSTRAINT "plot_events_storyline_id_storylines_id_fk" FOREIGN KEY ("storyline_id") REFERENCES "public"."storylines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_events" ADD CONSTRAINT "plot_events_volume_id_volumes_id_fk" FOREIGN KEY ("volume_id") REFERENCES "public"."volumes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plot_events" ADD CONSTRAINT "plot_events_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storylines" ADD CONSTRAINT "storylines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plot_events_project_position_idx" ON "plot_events" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "storylines_project_position_idx" ON "storylines" USING btree ("project_id","position");