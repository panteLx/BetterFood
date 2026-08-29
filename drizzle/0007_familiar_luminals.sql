CREATE TABLE `places` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`list_id` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `places_list_id_idx` ON `places` (`list_id`);--> statement-breakpoint
ALTER TABLE `items` ADD `place_id` integer REFERENCES places(id);--> statement-breakpoint
ALTER TABLE `items` ADD `note` text;