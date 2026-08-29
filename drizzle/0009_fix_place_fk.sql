-- items.place_id zeigte ohne "ON DELETE SET NULL" auf places: die Spalte kam
-- in 0007 per "ALTER TABLE ... ADD COLUMN" dazu, und drizzle-kit laesst die
-- FK-Aktion dort weg. In der Datenbank stand damit NO ACTION -- das Loeschen
-- eines belegten Ortes scheiterte an der Fremdschluesselpruefung ("Konnte Ort
-- nicht entfernen"), und dasselbe haette das kaskadierte Loeschen einer Liste
-- getroffen. SQLite kann eine FK-Aktion nicht nachtraeglich aendern, deshalb
-- der Tabellentausch (12-Schritte-Verfahren, gleiches Muster wie in 0002).
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`barcode` text,
	`place_id` integer,
	`note` text,
	`quantity` integer DEFAULT 1 NOT NULL,
	`added_at` integer NOT NULL,
	`expiry_date` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`resolved_at` integer,
	`hidden_at` integer,
	`last_notified_at` integer,
	`list_id` integer,
	`added_by_id` text,
	FOREIGN KEY (`place_id`) REFERENCES `places`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`list_id`) REFERENCES `lists`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`added_by_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "name", "category", "barcode", "place_id", "note", "quantity", "added_at", "expiry_date", "status", "resolved_at", "hidden_at", "last_notified_at", "list_id", "added_by_id") SELECT "id", "name", "category", "barcode", "place_id", "note", "quantity", "added_at", "expiry_date", "status", "resolved_at", "hidden_at", "last_notified_at", "list_id", "added_by_id" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
