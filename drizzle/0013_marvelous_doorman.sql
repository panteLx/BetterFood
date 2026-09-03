CREATE TABLE `item_notifications` (
	`item_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`notified_at` integer NOT NULL,
	PRIMARY KEY(`item_id`, `user_id`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
--> Der bisherige Merker am Artikel, übernommen auf jedes Mitglied der Liste,
--> in der der Artikel liegt. Von Hand eingefügt zwischen die beiden von
--> drizzle-kit erzeugten Anweisungen -- ohne diesen Schritt fände der erste
--> Lauf nach dem Deploy für jeden Artikel eine leere Tabelle vor und meldete
--> den kompletten Vorrat noch einmal an alle.
-->
--> Die Übernahme ist absichtlich grob: der alte Wert sagt nur "irgendwer
--> wurde an diesem Tag benachrichtigt", nicht wer. Ihn allen zu geben ist der
--> stille Fall -- schlimmstenfalls verschluckt ein Mitglied eine Meldung, die
--> es noch nicht hatte, statt dass alle eine bekommen, die sie schon hatten.
-->
--> Artikel ohne Liste fallen durch den JOIN heraus; sie haben ohnehin kein
--> Mitglied, das benachrichtigt werden könnte.
INSERT INTO `item_notifications` (`item_id`, `user_id`, `notified_at`)
SELECT `items`.`id`, `list_members`.`user_id`, `items`.`last_notified_at`
FROM `items`
JOIN `list_members` ON `list_members`.`list_id` = `items`.`list_id`
WHERE `items`.`last_notified_at` IS NOT NULL;--> statement-breakpoint
ALTER TABLE `items` DROP COLUMN `last_notified_at`;--> statement-breakpoint
--> Der Merker der Wochenübersicht trägt ab jetzt die Liste im Schlüssel
--> ("notification_weekly_last_sent:<id>"). Der alte, listenlose Schlüssel
--> wird von niemandem mehr gelesen -- und weil er nur festhält, ob die
--> Übersicht am heutigen Sonntag schon raus ist, kostet sein Wegfall
--> schlimmstenfalls eine zusätzliche Übersicht am Tag des Deploys.
DELETE FROM `settings` WHERE `key` = 'notification_weekly_last_sent';
