ALTER TABLE `entries` ADD `writable` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `entries` ADD `control_identity` text;--> statement-breakpoint
ALTER TABLE `grants` ADD `can_write` integer DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE schema_state SET revision = 5 WHERE id = 1;
