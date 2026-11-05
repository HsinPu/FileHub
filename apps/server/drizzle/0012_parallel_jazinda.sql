CREATE TABLE `__new_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`default_view` text DEFAULT 'list' NOT NULL,
	`page_size` integer DEFAULT 50 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "preferences_view" CHECK("__new_preferences"."default_view" IN ('list','mosaic','thumbnails')),
	CONSTRAINT "preferences_page_size" CHECK("__new_preferences"."page_size" IN (25,50,100))
);
--> statement-breakpoint
INSERT INTO `__new_preferences`("user_id", "default_view", "page_size") SELECT "user_id", "default_view", "page_size" FROM `preferences`;--> statement-breakpoint
DROP TABLE `preferences`;--> statement-breakpoint
ALTER TABLE `__new_preferences` RENAME TO `preferences`;--> statement-breakpoint
UPDATE schema_state SET revision = 13 WHERE id = 1;
