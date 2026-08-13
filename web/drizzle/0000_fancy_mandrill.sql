CREATE TABLE `workspace_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`state_key` text NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspace_state_state_key_unique` ON `workspace_state` (`state_key`);