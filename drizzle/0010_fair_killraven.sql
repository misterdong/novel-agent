CREATE TABLE "story_item_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"chapter_id" uuid,
	"change_type" varchar(40) DEFAULT 'updated' NOT NULL,
	"description" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "story_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"item_type" varchar(50) DEFAULT 'plot' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"holder_character_id" uuid,
	"current_location" varchar(200) DEFAULT '' NOT NULL,
	"status" varchar(40) DEFAULT 'intact' NOT NULL,
	"story_function" text DEFAULT '' NOT NULL,
	"next_plan" text DEFAULT '' NOT NULL,
	"related_character_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"related_foreshadowing_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"first_chapter_id" uuid,
	"last_changed_chapter_id" uuid,
	"importance" integer DEFAULT 3 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "story_item_changes" ADD CONSTRAINT "story_item_changes_item_id_story_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."story_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_item_changes" ADD CONSTRAINT "story_item_changes_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_items" ADD CONSTRAINT "story_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_items" ADD CONSTRAINT "story_items_holder_character_id_characters_id_fk" FOREIGN KEY ("holder_character_id") REFERENCES "public"."characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_items" ADD CONSTRAINT "story_items_first_chapter_id_chapters_id_fk" FOREIGN KEY ("first_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "story_items" ADD CONSTRAINT "story_items_last_changed_chapter_id_chapters_id_fk" FOREIGN KEY ("last_changed_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "story_items_project_name_idx" ON "story_items" USING btree ("project_id","name");