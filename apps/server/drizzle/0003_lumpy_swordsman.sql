CREATE TABLE `write_intents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`owner` text NOT NULL,
	`generation` integer NOT NULL,
	`resources` text NOT NULL,
	`payload` text NOT NULL,
	`evidence` text DEFAULT '{}' NOT NULL,
	`error_code` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "write_intents_state" CHECK("write_intents"."status" IN ('prepared','applying','succeeded','failed','needs_review')),
	CONSTRAINT "write_intents_kind" CHECK("write_intents"."kind" IN ('mkdir','rename','trash','restore'))
);
--> statement-breakpoint
CREATE INDEX `write_intents_status` ON `write_intents` (`status`);--> statement-breakpoint
CREATE INDEX `write_intents_user` ON `write_intents` (`user_id`);
--> statement-breakpoint
UPDATE schema_state SET revision = 4 WHERE id = 1;
