import { sqliteTable, text, integer, index, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import { session, user } from "./auth-schema";

export * from "./auth-schema";

export const lists = sqliteTable("lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  archivedAt: integer("archived_at", { mode: "timestamp" }),
});

export const listMembers = sqliteTable(
  "list_members",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [uniqueIndex("list_members_list_id_user_id_unique").on(table.listId, table.userId)],
);

/**
 * Die Faecher, in denen der Vorrat tatsaechlich liegt: Kuehlschrank,
 * Gefrierfach, Vorratsschrank, Keller.
 *
 * Bewusst eine eigene Tabelle und kein Textfeld am Artikel: ein Ort wird
 * umbenannt ("Kuehlschrank" -> "Kuehlschrank unten"), und alle Artikel darin
 * sollen der Umbenennung folgen, statt auf einen Namen zu zeigen, den es
 * nicht mehr gibt. Und bewusst getrennt von der Kategorie: wo etwas liegt und
 * was es ist, sind zwei verschiedene Fragen -- TK-Erbsen und Lachsfilet
 * teilen sich das Gefrierfach, nicht die Kategorie.
 */
export const places = sqliteTable(
  "places",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    listId: integer("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
  },
  (table) => [index("places_list_id_idx").on(table.listId)],
);

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  barcode: text("barcode"),
  // Optional, und das bleibt so: ein Artikel ohne zugeordneten Ort ist kein
  // Fehler, sondern der Normalfall fuer alles, was vor den Orten erfasst
  // wurde. onDelete "set null" statt Kaskade -- wer einen Ort loescht, will
  // das Fach aufraeumen, nicht seinen Vorrat.
  placeId: integer("place_id").references(() => places.id, { onDelete: "set null" }),
  note: text("note"),
  quantity: integer("quantity").notNull().default(1),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
  expiryDate: integer("expiry_date", { mode: "timestamp" }).notNull(),
  status: text("status", { enum: ["active", "used", "thrown_away"] })
    .notNull()
    .default("active"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  // Ausgeblendet statt geloescht: der Artikel verschwindet ueberall aus der
  // Oberflaeche, bleibt aber als Beleg dessen erhalten, was hier tatsaechlich
  // im Vorrat lag. Was die Liste ueber das Produkt gelernt hat, steht davon
  // unabhaengig in product_knowledge und ueberlebt jedes Aufraeumen ohnehin.
  hiddenAt: integer("hidden_at", { mode: "timestamp" }),
  lastNotifiedAt: integer("last_notified_at", { mode: "timestamp" }),
  listId: integer("list_id").references(() => lists.id),
  addedById: text("added_by_id").references(() => user.id),
});

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    shelfLifeDays: integer("shelf_life_days").notNull().default(14),
    // Das Fach, in dem diese Kategorie ueblicherweise liegt. Es beantwortet
    // die zweite Frage des Formulars gleich mit: wer "Tiefkuehl" waehlt,
    // meint fast immer das Gefrierfach. Bewusst schwaecher als
    // product_knowledge.placeId -- was der Haushalt ueber ein konkretes
    // Produkt gelernt hat, schlaegt den Standard der Kategorie immer.
    //
    // onDelete "set null" wie bei items.placeId und
    // productKnowledge.placeId: ein geleertes Fach darf die Kategorie nicht
    // mit sich reissen.
    defaultPlaceId: integer("default_place_id").references(() => places.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    listId: integer("list_id").references(() => lists.id),
  },
  (table) => [uniqueIndex("categories_list_id_key_unique").on(table.listId, table.key)],
);

/**
 * Die Wissensdatenbank einer Liste: "dieses Produkt gehoert bei uns in diese
 * Kategorie".
 *
 * Bewusst eine eigene Tabelle und nicht mehr der zuletzt erfasste Artikel:
 * Wissen und Vorrat sind zwei verschiedene Dinge. Nur so laesst sich eine
 * einmal falsch getroffene Zuordnung spaeter korrigieren, ohne dabei
 * rueckwirkend echte Vorratsartikel umzuschreiben -- und nur so ueberlebt
 * das Wissen jedes Aufraeumen im Archiv.
 *
 * Ein Eintrag wird ueber den Barcode identifiziert, oder -- bei von Hand
 * eingetragenen Artikeln, die keinen haben -- ueber den normalisierten Namen.
 */
export const productKnowledge = sqliteTable(
  "product_knowledge",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    listId: integer("list_id")
      .notNull()
      .references(() => lists.id, { onDelete: "cascade" }),
    barcode: text("barcode"),
    // Vergleichsform des Namens (siehe normalizeProductName). Getrennt vom
    // Anzeigenamen gespeichert, damit "Milch" und "milch " denselben Eintrag
    // treffen, die Liste dem Nutzer aber seine eigene Schreibweise zeigt.
    nameKey: text("name_key").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    // Wo dieser Haushalt das Produkt zuletzt hingelegt hat. Optional, weil
    // die Tabelle aelter ist als dieses Wissen -- und weil ein geloeschtes
    // Fach das Gelernte ueber das Produkt nicht mit sich reissen darf
    // (onDelete "set null", genau wie bei items.placeId).
    placeId: integer("place_id").references(() => places.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (table) => [
    // SQLite behandelt NULLs in einem UNIQUE-Index als verschieden -- die
    // vielen barcodelosen Eintraege kollidieren hier also nicht miteinander.
    // Deren Eindeutigkeit ueber den Namen stellt rememberProduct sicher.
    uniqueIndex("product_knowledge_list_id_barcode_unique").on(table.listId, table.barcode),
    index("product_knowledge_list_id_name_key_idx").on(table.listId, table.nameKey),
  ],
);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  userId: text("user_id").references(() => user.id),
  // Welches Geraet -- genauer: welche Anmeldung -- diese Subscription
  // gehoert. Ohne die Spalte ueberlebt die Push-Anmeldung eines Geraets, das
  // in /settings/account rausgeworfen wurde, den Rauswurf und schickt weiter
  // Erinnerungen. Nullable, weil Zeilen aus der Zeit davor keine Session
  // mehr nennen koennen; sie binden sich beim naechsten Abgleich durch
  // <PushSync /> von selbst nach.
  sessionId: text("session_id").references(() => session.id, {
    onDelete: "cascade",
  }),
});

export const settings = sqliteTable(
  "settings",
  {
    key: text("key").notNull(),
    value: text("value").notNull(),
    userId: text("user_id").references(() => user.id),
  },
  (table) => [primaryKey({ columns: [table.userId, table.key] })],
);

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
export type ListMember = typeof listMembers.$inferSelect;
export type ProductKnowledge = typeof productKnowledge.$inferSelect;
