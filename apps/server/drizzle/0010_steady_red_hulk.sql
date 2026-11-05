CREATE TABLE `share_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`share_id`) REFERENCES `shares`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `share_sessions_share` ON `share_sessions` (`share_id`);--> statement-breakpoint
CREATE INDEX `share_sessions_expiry` ON `share_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `share_throttle` (
	`key` text PRIMARY KEY NOT NULL,
	`window_start` integer NOT NULL,
	`attempts` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `shares` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`entry_id` text NOT NULL,
	`path` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`device` text NOT NULL,
	`inode` text NOT NULL,
	`birthtime_ns` text NOT NULL,
	`secret_hash` text NOT NULL,
	`password_hash` text,
	`request_hash` text NOT NULL,
	`revoked` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "shares_kind" CHECK("shares"."kind" IN ('file','directory'))
);
--> statement-breakpoint
CREATE INDEX `shares_user` ON `shares` (`user_id`,`created_at`);
--> statement-breakpoint
UPDATE schema_state SET revision = 11 WHERE id = 1;
