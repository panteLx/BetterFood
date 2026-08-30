--> ON DELETE CASCADE ergaenzt: drizzle-kit laesst die Aktion bei
--> "ALTER TABLE ... ADD COLUMN" weg, SQLite kennt sie dort aber sehr wohl.
--> Ohne sie waere die Aktion NO ACTION -- und genau daran haengt der Zweck der
--> Spalte: wer in /settings/account ein fremdes Geraet abmeldet, soll damit
--> auch dessen Push-Anmeldung los sein. Siehe 0008 und 0010, dieselbe Falle.
ALTER TABLE `push_subscriptions` ADD `session_id` text REFERENCES session(id) ON DELETE CASCADE;
