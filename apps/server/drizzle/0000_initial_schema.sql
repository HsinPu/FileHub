CREATE TABLE `schema_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer NOT NULL,
	CONSTRAINT "schema_state_singleton" CHECK("schema_state"."id" = 1)
);
--> statement-breakpoint
INSERT INTO `schema_state` (`id`, `revision`) VALUES (1, 1);
