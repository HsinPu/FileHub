CREATE TABLE `entries` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`kind` text NOT NULL,
	`root_path` text NOT NULL,
	`root_device` text NOT NULL,
	`root_inode` text NOT NULL,
	`root_ancestors` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	CONSTRAINT "entries_kind" CHECK("entries"."kind" IN ('managed', 'external'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_root_path_unique` ON `entries` (`root_path`);--> statement-breakpoint
CREATE TABLE `grants` (
	`user_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`scope` text NOT NULL,
	`can_download` integer NOT NULL,
	PRIMARY KEY(`user_id`, `entry_id`, `scope`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
UPDATE schema_state SET revision = 3 WHERE id = 1;
