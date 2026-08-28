CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`shelf_life_days` integer DEFAULT 14 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_key_unique` ON `categories` (`key`);--> statement-breakpoint
ALTER TABLE `items` ADD `quantity` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `resolved_at` integer;--> statement-breakpoint
INSERT INTO `categories` (`key`, `label`, `shelf_life_days`, `created_at`) VALUES
	('milchprodukte', 'Milchprodukte', 7, unixepoch()),
	('fleisch_fisch', 'Fleisch & Fisch', 3, unixepoch()),
	('obst_gemuese', 'Obst & Gemüse', 5, unixepoch()),
	('brot_backwaren', 'Brot & Backwaren', 4, unixepoch()),
	('kuehlware_sonstig', 'Kühlware (sonstig)', 7, unixepoch()),
	('tiefkuehl', 'Tiefkühl', 180, unixepoch()),
	('konserven', 'Konserven', 365, unixepoch()),
	('trockenwaren', 'Trockenwaren', 270, unixepoch()),
	('getraenke', 'Getränke', 180, unixepoch()),
	('sonstiges', 'Sonstiges', 14, unixepoch());