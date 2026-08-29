import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { categories, items, listMembers, lists, pushSubscriptions, user } from "@/db/schema";
import { count, eq, isNull } from "drizzle-orm";
import {
  listHasCategories,
  listHasPlaces,
  seedDefaultCategories,
  seedDefaultPlaces,
} from "@/lib/data";

const oidcConfigured = Boolean(
  process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET,
);

const DEFAULT_HOUSEHOLD_NAME = "Zuhause";

/**
 * Der Name des Haushalts, den die Registrierung mitschickt.
 *
 * Er kommt aus dem Anfragekoerper und nicht aus einem eigenen Feld an der
 * Nutzertabelle: gebraucht wird er genau einmal, naemlich fuer die erste
 * Liste. Eine Spalte dafuer waere eine zweite Wahrheit neben lists.name --
 * und wuerde beim Umbenennen der Liste sofort falsch.
 *
 * Fehlt er (SSO-Anmeldung, aelterer Client), bleibt es beim Standardnamen.
 * Die Laengenbegrenzung, weil die Registrierung ohne Anmeldung erreichbar
 * ist.
 */
function readHouseholdName(context: { body?: unknown } | null): string {
  const body = context?.body;
  if (!body || typeof body !== "object") return DEFAULT_HOUSEHOLD_NAME;

  const value = (body as { householdName?: unknown }).householdName;
  if (typeof value !== "string") return DEFAULT_HOUSEHOLD_NAME;

  return value.trim().slice(0, 60) || DEFAULT_HOUSEHOLD_NAME;
}

async function claimLegacyData(
  newUser: { id: string },
  context: { body?: unknown } | null,
) {
  const [{ value: userCount }] = await db.select({ value: count() }).from(user);

  const now = new Date();
  const [list] = await db
    .insert(lists)
    .values({ name: readHouseholdName(context), ownerId: newUser.id, createdAt: now })
    .returning();

  await db.insert(listMembers).values({ listId: list.id, userId: newUser.id, addedAt: now });

  if (userCount === 1) {
    await db.update(items).set({ listId: list.id }).where(isNull(items.listId));
    await db.update(categories).set({ listId: list.id }).where(isNull(categories.listId));
    await db
      .update(pushSubscriptions)
      .set({ userId: newUser.id })
      .where(isNull(pushSubscriptions.userId));
  }

  // Erst NACH dem moeglichen Claim pruefen: hat der allererste Nutzer bereits
  // Alt-Kategorien uebernommen, wuerde ein Seed sie hier verdoppeln. Alle
  // anderen Nutzer starten sonst ohne eine einzige Kategorie und koennten
  // keinen Artikel speichern, ohne sich vorher selbst eine auszudenken.
  if (!(await listHasCategories(list.id))) {
    await seedDefaultCategories(list.id);
  }

  // Dieselbe Ueberlegung fuer die Orte: ohne sie bliebe die Frage "Wo liegt
  // es?" beim ersten Artikel unbeantwortbar.
  if (!(await listHasPlaces(list.id))) {
    await seedDefaultPlaces(list.id);
  }

  await db.update(user).set({ activeListId: list.id }).where(eq(user.id, newUser.id));
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: {
    enabled: true,
  },
  databaseHooks: {
    user: {
      create: {
        after: claimLegacyData,
      },
    },
  },
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  plugins: oidcConfigured
    ? [
        genericOAuth({
          config: [
            {
              providerId: "oidc",
              name: process.env.NEXT_PUBLIC_OIDC_DISPLAY_NAME ?? "SSO",
              discoveryUrl: `${process.env.OIDC_ISSUER}/.well-known/openid-configuration`,
              clientId: process.env.OIDC_CLIENT_ID!,
              clientSecret: process.env.OIDC_CLIENT_SECRET!,
              scopes: ["openid", "profile", "email"],
            },
          ],
        }),
      ]
    : [],
});
