CREATE TABLE `imports` (
	`id` text PRIMARY KEY NOT NULL,
	`file_name` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`row_count` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `imports_storage_key_unique` ON `imports` (`storage_key`);--> statement-breakpoint
CREATE INDEX `idx_imports_created_at` ON `imports` (`created_at`);--> statement-breakpoint
CREATE TABLE `routes` (
	`id` text PRIMARY KEY NOT NULL,
	`import_id` text,
	`date` text NOT NULL,
	`route` text NOT NULL,
	`vehicle` text NOT NULL,
	`driver` text NOT NULL,
	`origin` text DEFAULT '' NOT NULL,
	`destination` text DEFAULT '' NOT NULL,
	`start_odometer` real,
	`end_odometer` real,
	`km` real NOT NULL,
	`start_time` text,
	`end_time` text,
	`duration_minutes` integer DEFAULT 0 NOT NULL,
	`liters` real NOT NULL,
	`diesel_price` real NOT NULL,
	`revenue` real NOT NULL,
	`other_costs` real DEFAULT 0 NOT NULL,
	`operational_status` text DEFAULT 'Concluída' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `imports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_routes_date` ON `routes` (`date`);--> statement-breakpoint
CREATE INDEX `idx_routes_import_id` ON `routes` (`import_id`);--> statement-breakpoint
PRAGMA optimize;
