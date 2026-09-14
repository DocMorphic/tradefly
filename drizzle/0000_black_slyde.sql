CREATE TABLE `backend_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`snapshot` text,
	`received_at` text,
	`command` text DEFAULT 'pause' NOT NULL,
	`command_id` text DEFAULT 'initial' NOT NULL,
	`command_at` text
);
