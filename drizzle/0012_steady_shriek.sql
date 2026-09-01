ALTER TABLE `categories` ADD `avg_price_cents` integer;--> statement-breakpoint
ALTER TABLE `categories` ADD `avg_co2_grams` integer;--> statement-breakpoint
--> Einmalige Vorbelegung fuer bereits bestehende Listen. Neue Listen bekommen
--> dieselben Werte ueber seedDefaultCategories() beim Anlegen
--> (src/lib/categories.ts haelt die Tabelle); hier steht es als Migration und
--> nicht als Backfill beim Booten, weil ein wiederkehrender Backfill einen
--> bewusst geleerten oder korrigierten Wert bei jedem Neustart
--> zurueckschreiben wuerde. Siehe 0010, dieselbe Ueberlegung.
-->
--> Getroffen wird ueber `key`, nicht ueber `label`: den Namen darf der Nutzer
--> umbenennen, der Schluessel bleibt. Eine in "Molkerei" umbenannte Kategorie
--> milchprodukte ist immer noch Milch.
-->
--> "IS NULL" ist hier streng genommen redundant -- die Spalten entstehen zwei
--> Anweisungen weiter oben und sind ueberall NULL -- steht aber trotzdem da,
--> damit die Anweisung auch bei einem wiederholten Lauf nichts ueberschreibt,
--> was der Nutzer inzwischen im Kategorie-Editor gesetzt hat.
-->
--> 'sonstiges' fehlt bewusst: eine Kategorie, die alles sein kann, kann nichts
--> schaetzen. NULL heisst dort "zaehlt nicht mit", nicht "kostet nichts".
UPDATE `categories` SET `avg_price_cents` = CASE `key`
  WHEN 'milchprodukte'     THEN 150
  WHEN 'fleisch_fisch'     THEN 500
  WHEN 'obst_gemuese'      THEN 200
  WHEN 'brot_backwaren'    THEN 250
  WHEN 'kuehlware_sonstig' THEN 250
  WHEN 'tiefkuehl'         THEN 300
  WHEN 'konserven'         THEN 120
  WHEN 'trockenwaren'      THEN 180
  WHEN 'getraenke'         THEN 120
END
WHERE `avg_price_cents` IS NULL
  AND `key` IN ('milchprodukte', 'fleisch_fisch', 'obst_gemuese', 'brot_backwaren',
                'kuehlware_sonstig', 'tiefkuehl', 'konserven', 'trockenwaren', 'getraenke');--> statement-breakpoint
--> Gramm CO2e je typischer Einkaufseinheit: Milch 500 g bzw. 1 l, Fleisch
--> 400 g, Obst 500 g, Getraenke 1 l -- mal einem ueblichen
--> Lebenszyklus-Kennwert pro Kilogramm, nach unten gerundet.
UPDATE `categories` SET `avg_co2_grams` = CASE `key`
  WHEN 'milchprodukte'     THEN 1400
  WHEN 'fleisch_fisch'     THEN 2800
  WHEN 'obst_gemuese'      THEN 300
  WHEN 'brot_backwaren'    THEN 400
  WHEN 'kuehlware_sonstig' THEN 500
  WHEN 'tiefkuehl'         THEN 900
  WHEN 'konserven'         THEN 500
  WHEN 'trockenwaren'      THEN 600
  WHEN 'getraenke'         THEN 400
END
WHERE `avg_co2_grams` IS NULL
  AND `key` IN ('milchprodukte', 'fleisch_fisch', 'obst_gemuese', 'brot_backwaren',
                'kuehlware_sonstig', 'tiefkuehl', 'konserven', 'trockenwaren', 'getraenke');
