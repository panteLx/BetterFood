ALTER TABLE `items` ADD `added_by_id` text REFERENCES user(id);--> statement-breakpoint
ALTER TABLE `lists` ADD `archived_at` integer;