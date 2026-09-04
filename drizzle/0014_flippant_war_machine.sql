CREATE TABLE `recipe_suggestions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`created_by_id` text,
	`created_at` integer NOT NULL,
	`recipes` text NOT NULL,
	`based_on` text NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `recipe_suggestions_list_id_created_at_idx` ON `recipe_suggestions` (`list_id`,`created_at`);