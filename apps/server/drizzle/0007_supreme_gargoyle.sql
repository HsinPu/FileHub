CREATE TABLE `operation_items` (
	`operation_id` text NOT NULL,
	`item_index` integer NOT NULL,
	`entry_id` text NOT NULL,
	`path` text NOT NULL,
	`state` text DEFAULT 'pending' NOT NULL,
	`bytes_done` integer DEFAULT 0 NOT NULL,
	`bytes_total` integer DEFAULT 0 NOT NULL,
	`evidence` text DEFAULT '{}' NOT NULL,
	`error_code` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`operation_id`, `item_index`),
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "operation_items_index" CHECK("operation_items"."item_index" BETWEEN 0 AND 15),
	CONSTRAINT "operation_items_state" CHECK("operation_items"."state" IN ('pending','running','succeeded','failed','cancelled','needs_review')),
	CONSTRAINT "operation_items_bytes" CHECK("operation_items"."bytes_done" BETWEEN 0 AND "operation_items"."bytes_total" AND "operation_items"."bytes_total" BETWEEN 0 AND 2147483648)
);
--> statement-breakpoint
CREATE TABLE `operations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`state` text NOT NULL,
	`request` text NOT NULL,
	`resources` text NOT NULL,
	`owner` text,
	`attempt` integer DEFAULT 0 NOT NULL,
	`lease_until` integer,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "operations_kind" CHECK("operations"."kind" IN ('copy','move','archive')),
	CONSTRAINT "operations_state" CHECK("operations"."state" IN ('queued','running','cancelling','succeeded','partial','failed','cancelled','interrupted','needs_review')),
	CONSTRAINT "operations_attempt" CHECK("operations"."attempt" >= 0)
);
--> statement-breakpoint
CREATE INDEX `operations_user` ON `operations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `operations_queue` ON `operations` (`state`,`created_at`);
--> statement-breakpoint
UPDATE schema_state SET revision = 8 WHERE id = 1;
