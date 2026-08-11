CREATE TABLE `api_rate_limits` (
	`bucket_key` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`reset_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_api_rate_limits_reset_at` ON `api_rate_limits` (`reset_at`);