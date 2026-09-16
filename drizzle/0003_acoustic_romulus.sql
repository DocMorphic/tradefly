CREATE TABLE `market_history` (
	`symbol` text PRIMARY KEY NOT NULL,
	`payload` text,
	`requested_at` integer NOT NULL,
	`attempted_at` integer DEFAULT 0 NOT NULL,
	`fetched_at` integer,
	`error` text
);
--> statement-breakpoint
CREATE INDEX `idx_market_history_requested` ON `market_history` (`requested_at`);