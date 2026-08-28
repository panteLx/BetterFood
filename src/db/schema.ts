import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

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
  lastNotifiedAt: integer("last_notified_at", { mode: "timestamp" }),
});

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  shelfLifeDays: integer("shelf_life_days").notNull().default(14),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const pushSubscriptions = sqliteTable("push_subscriptions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export type Item = typeof items.$inferSelect;
export type NewItem = typeof items.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
