CREATE TABLE `entry_candidates` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`root_path` text NOT NULL,
	`root_identity` text NOT NULL,
	CONSTRAINT "entry_candidates_kind" CHECK("entry_candidates"."kind" IN ('managed','external'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entry_candidates_root_path_unique` ON `entry_candidates` (`root_path`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_view` text DEFAULT 'list' NOT NULL,
	`page_size` integer DEFAULT 50 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "preferences_view" CHECK("preferences"."default_view" IN ('list','thumbnails')),
	CONSTRAINT "preferences_page_size" CHECK("preferences"."page_size" IN (25,50,100))
);

--> statement-breakpoint
UPDATE schema_state SET revision = 12 WHERE id = 1;
