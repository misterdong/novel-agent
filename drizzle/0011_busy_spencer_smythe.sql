CREATE TABLE "character_relationship_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"relationship_id" uuid NOT NULL,
	"chapter_id" uuid,
	"previous_status" varchar(60) DEFAULT '' NOT NULL,
	"new_status" varchar(60) DEFAULT '' NOT NULL,
	"description" text NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_relationships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"character_a_id" uuid NOT NULL,
	"character_b_id" uuid NOT NULL,
	"relation_type" varchar(60) DEFAULT 'acquaintance' NOT NULL,
	"status" varchar(60) DEFAULT 'neutral' NOT NULL,
	"a_to_b_attitude" text DEFAULT '' NOT NULL,
	"b_to_a_attitude" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"next_direction" text DEFAULT '' NOT NULL,
	"first_chapter_id" uuid,
	"last_changed_chapter_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "character_relationship_changes" ADD CONSTRAINT "character_relationship_changes_relationship_id_character_relationships_id_fk" FOREIGN KEY ("relationship_id") REFERENCES "public"."character_relationships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_relationship_changes" ADD CONSTRAINT "character_relationship_changes_chapter_id_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_character_a_id_characters_id_fk" FOREIGN KEY ("character_a_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_character_b_id_characters_id_fk" FOREIGN KEY ("character_b_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_first_chapter_id_chapters_id_fk" FOREIGN KEY ("first_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_relationships" ADD CONSTRAINT "character_relationships_last_changed_chapter_id_chapters_id_fk" FOREIGN KEY ("last_changed_chapter_id") REFERENCES "public"."chapters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "character_relationship_pair_idx" ON "character_relationships" USING btree ("project_id","character_a_id","character_b_id");