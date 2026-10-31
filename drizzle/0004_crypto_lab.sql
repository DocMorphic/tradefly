CREATE TABLE `crypto_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`snapshot` text NOT NULL,
	`decision_count` integer NOT NULL,
	`received_at` text NOT NULL
);
