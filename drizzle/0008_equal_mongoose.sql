--> ON DELETE SET NULL ergaenzt: drizzle-kit laesst die Aktion bei
--> "ALTER TABLE ... ADD COLUMN" weg, SQLite kennt sie dort aber sehr wohl.
--> Ohne sie waere die Aktion NO ACTION, und das Loeschen eines Ortes -- auch
--> das kaskadierte beim Loeschen einer Liste -- schluege fehl, sobald eine
--> gelernte Zeile darauf zeigt.
ALTER TABLE `product_knowledge` ADD `place_id` integer REFERENCES places(id) ON DELETE SET NULL;
