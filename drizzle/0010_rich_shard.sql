--> ON DELETE SET NULL ergaenzt: drizzle-kit laesst die Aktion bei
--> "ALTER TABLE ... ADD COLUMN" weg, SQLite kennt sie dort aber sehr wohl.
--> Ohne sie waere die Aktion NO ACTION, und das Loeschen eines Faches -- auch
--> das kaskadierte beim Loeschen einer Liste -- schluege fehl, sobald eine
--> Kategorie es als Standardort fuehrt. Siehe 0008, dieselbe Falle.
ALTER TABLE `categories` ADD `default_place_id` integer REFERENCES places(id) ON DELETE SET NULL;--> statement-breakpoint
--> Einmalige Vorbelegung fuer bereits bestehende Listen. Neue Listen bekommen
--> dasselbe ueber applyDefaultCategoryPlaces() beim Anlegen (src/lib/data.ts);
--> hier steht es als Migration und nicht als Backfill beim Booten, weil ein
--> wiederkehrender Backfill einen bewusst geleerten Standardort bei jedem
--> Neustart zurueckschreiben wuerde.
--> Nur dort, wo der Nutzer den Standardnamen des Faches nie geaendert hat --
--> ohne passendes Fach bleibt die Spalte NULL.
UPDATE `categories` SET `default_place_id` = (
  SELECT p.id FROM `places` p WHERE p.list_id = `categories`.`list_id` AND p.name = 'Kühlschrank' LIMIT 1
) WHERE `default_place_id` IS NULL
  AND `key` IN ('milchprodukte', 'fleisch_fisch', 'obst_gemuese', 'kuehlware_sonstig')
  AND EXISTS (SELECT 1 FROM `places` p WHERE p.list_id = `categories`.`list_id` AND p.name = 'Kühlschrank');--> statement-breakpoint
UPDATE `categories` SET `default_place_id` = (
  SELECT p.id FROM `places` p WHERE p.list_id = `categories`.`list_id` AND p.name = 'Gefrierfach' LIMIT 1
) WHERE `default_place_id` IS NULL
  AND `key` IN ('tiefkuehl')
  AND EXISTS (SELECT 1 FROM `places` p WHERE p.list_id = `categories`.`list_id` AND p.name = 'Gefrierfach');--> statement-breakpoint
UPDATE `categories` SET `default_place_id` = (
  SELECT p.id FROM `places` p WHERE p.list_id = `categories`.`list_id` AND p.name = 'Vorratsschrank' LIMIT 1
) WHERE `default_place_id` IS NULL
  AND `key` IN ('brot_backwaren', 'konserven', 'trockenwaren', 'getraenke')
  AND EXISTS (SELECT 1 FROM `places` p WHERE p.list_id = `categories`.`list_id` AND p.name = 'Vorratsschrank');
