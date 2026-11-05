CREATE TABLE `trash_items` (
	`id` text PRIMARY KEY NOT NULL,
	`entry_id` text NOT NULL,
	`user_id` text NOT NULL,
	`original_path` text NOT NULL,
	`kind` text NOT NULL,
	`witness` text NOT NULL,
	`status` text NOT NULL,
	`mutation_id` text NOT NULL,
	`restore_mutation_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`mutation_id`) REFERENCES `write_intents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`restore_mutation_id`) REFERENCES `write_intents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "trash_items_state" CHECK("trash_items"."status" IN ('prepared','available','restoring','restored','failed','needs_review')),
	CONSTRAINT "trash_items_kind" CHECK("trash_items"."kind" IN ('file','directory'))
);
--> statement-breakpoint
CREATE INDEX `trash_items_entry` ON `trash_items` (`entry_id`);--> statement-breakpoint
CREATE INDEX `trash_items_user` ON `trash_items` (`user_id`);
--> statement-breakpoint
UPDATE schema_state SET revision = 6 WHERE id = 1;
