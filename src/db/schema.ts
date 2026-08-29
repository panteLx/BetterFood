import { sqliteTable, text, integer, primaryKey, uniqueIndex } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

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

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  barcode: text("barcode"),
  quantity: integer("quantity").notNull().default(1),
  addedAt: integer("added_at", { mode: "timestamp" }).notNull(),
  expiryDate: integer("expiry_date", { mode: "timestamp" }).notNull(),
  status: text("status", { enum: ["active", "used", "thrown_away"] })
    .notNull()
    .default("active"),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  // Ausgeblendet statt geloescht: der Artikel verschwindet ueberall aus der
  // Oberflaeche, bleibt aber als Beleg dafuer erhalten, in welche Kategorie
  // dieser Haushalt dieses Produkt einsortiert -- genau davon lebt die
  // Vorauswahl beim naechsten Scan.
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
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    listId: integer("list_id").references(() => lists.id),
  },
  (table) => [uniqueIndex("categories_list_id_key_unique").on(table.listId, table.key)],
);

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  userId: text("user_id").references(() => user.id),
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
export type List = typeof lists.$inferSelect;
export type NewList = typeof lists.$inferInsert;
export type ListMember = typeof listMembers.$inferSelect;
