CREATE TABLE `product_knowledge` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`list_id` integer NOT NULL,
	`barcode` text,
	`name_key` text NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_knowledge_list_id_barcode_unique` ON `product_knowledge` (`list_id`,`barcode`);--> statement-breakpoint
CREATE INDEX `product_knowledge_list_id_name_key_idx` ON `product_knowledge` (`list_id`,`name_key`);