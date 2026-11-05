CREATE TABLE `operation_artifacts` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`state` text NOT NULL,
	`witness` text,
	`sha256` text,
	`bytes` integer DEFAULT 0 NOT NULL,
	`reserved_bytes` integer NOT NULL,
	`cleaned` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `operations`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "operation_artifact_bytes" CHECK("operation_artifacts"."bytes" BETWEEN 0 AND 2155872256 AND "operation_artifacts"."reserved_bytes" BETWEEN 0 AND 2155872256),
	CONSTRAINT "operation_artifact_state" CHECK("operation_artifacts"."state" IN ('building','available','failed','cancelled','expired','needs_review'))
);
--> statement-breakpoint
CREATE INDEX `operation_artifact_expiry` ON `operation_artifacts` (`state`,`expires_at`);
--> statement-breakpoint
UPDATE schema_state SET revision = 10 WHERE id = 1;
