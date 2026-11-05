CREATE TABLE `operation_nodes` (
	`operation_id` text NOT NULL,
	`item_index` integer NOT NULL,
	`relative_path` text NOT NULL,
	`kind` text NOT NULL,
	`source_witness` text NOT NULL,
	`bytes` integer NOT NULL,
	`sha256` text,
	`destination_witness` text,
	PRIMARY KEY(`operation_id`, `item_index`, `relative_path`),
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "operation_nodes_bytes" CHECK("operation_nodes"."bytes" BETWEEN 0 AND 1073741824),
	CONSTRAINT "operation_nodes_kind" CHECK("operation_nodes"."kind" IN ('file','directory'))
);
--> statement-breakpoint
UPDATE schema_state SET revision = 9 WHERE id = 1;
