ALTER TABLE "volumes" ADD COLUMN "conflict" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "turning_point" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "volumes" ADD COLUMN "ending_hook" text DEFAULT '' NOT NULL;