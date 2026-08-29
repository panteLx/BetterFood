import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { categories, items, listMembers, lists, pushSubscriptions, user } from "@/db/schema";
import { count, eq, isNull } from "drizzle-orm";
import {
  DEFAULT_HOUSEHOLD_NAME,
  HOUSEHOLD_COOKIE,
  normalizeHouseholdName,
} from "@/lib/household";
import {
  listHasCategories,
  listHasPlaces,
  seedDefaultCategories,
  seedDefaultPlaces,
} from "@/lib/data";

const oidcConfigured = Boolean(
  process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET,
);

type Headerish = { get(name: string): string | null };

type SignUpContext = {
  body?: unknown;
  headers?: Headerish | null;
  request?: { headers: Headerish } | null;
} | null;

/**
 * Der Name des Haushalts aus der Registrierung -- siehe lib/household.ts.
 *
 * Zwei Wege, weil es zwei Arten gibt, ein Konto anzulegen: bei E-Mail und
 * Passwort steht der Name im Anfragekoerper, bei SSO wartet er im Cookie,
 * weil der Koerper die Runde ueber den Anbieter nicht ueberlebt. Ist beides
 * leer (aelterer Client, direkt an der API angelegt), bleibt es beim
 * Standardnamen.
 */
function readHouseholdName(context: SignUpContext): string {
  const body = context?.body;
  if (body && typeof body === "object") {
    const fromBody = normalizeHouseholdName((body as { householdName?: unknown }).householdName);
    if (fromBody) return fromBody;
  }

  const cookieHeader =
    context?.headers?.get("cookie") ?? context?.request?.headers.get("cookie") ?? null;
  const fromCookie = normalizeHouseholdName(readCookie(cookieHeader, HOUSEHOLD_COOKIE));
  if (fromCookie) return fromCookie;

  return DEFAULT_HOUSEHOLD_NAME;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key !== name) continue;
    try {
      return decodeURIComponent(rest.join("="));
    } catch {
      // Ein kaputt kodiertes Cookie ist kein Grund, die Registrierung
      // scheitern zu lassen -- dann eben der Standardname.
      return null;
    }
  }

  return null;
}

async function claimLegacyData(newUser: { id: string }, context: SignUpContext) {
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
