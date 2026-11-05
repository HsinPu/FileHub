CREATE TABLE `upload_chunks` (
	`upload_id` text NOT NULL,
	`offset` integer NOT NULL,
	`length` integer NOT NULL,
	`sha256` text NOT NULL,
	PRIMARY KEY(`upload_id`, `offset`),
	FOREIGN KEY (`upload_id`) REFERENCES `upload_sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "upload_chunks_bounds" CHECK("upload_chunks"."offset" >= 0 AND "upload_chunks"."length" BETWEEN 1 AND 4194304)
);
--> statement-breakpoint
CREATE TABLE `upload_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`parent` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`offset` integer DEFAULT 0 NOT NULL,
	`expected_sha256` text,
	`sha256` text,
	`state` text DEFAULT 'open' NOT NULL,
	`owner` text,
	`generation` integer DEFAULT 1 NOT NULL,
	`staging_identity` text,
	`payload_identity` text,
	`publication_id` text,
	`reserved_bytes` integer NOT NULL,
	`cleaned` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`publication_id`) REFERENCES `write_intents`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "uploads_state" CHECK("upload_sessions"."state" IN ('open','writing','finalizing','completed','cancelled','expired','needs_review')),
	CONSTRAINT "uploads_size" CHECK("upload_sessions"."size" BETWEEN 0 AND 1073741824 AND "upload_sessions"."offset" BETWEEN 0 AND "upload_sessions"."size" AND "upload_sessions"."reserved_bytes" BETWEEN 0 AND "upload_sessions"."size")
);
--> statement-breakpoint
CREATE INDEX `uploads_owner` ON `upload_sessions` (`user_id`,`entry_id`);--> statement-breakpoint
CREATE INDEX `uploads_cleanup` ON `upload_sessions` (`state`,`expires_at`);
--> statement-breakpoint
UPDATE schema_state SET revision = 7 WHERE id = 1;
