import { betterAuth } from "better-auth";
import { genericOAuth } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { categories, items, listMembers, lists, pushSubscriptions, user } from "@/db/schema";
import { count, eq, isNull } from "drizzle-orm";
import { listHasCategories, seedDefaultCategories } from "@/lib/data";

const oidcConfigured = Boolean(
  process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET,
);

async function claimLegacyData(newUser: { id: string }) {
  const [{ value: userCount }] = await db.select({ value: count() }).from(user);

  const now = new Date();
  const [list] = await db
    .insert(lists)
    .values({ name: "Zuhause", ownerId: newUser.id, createdAt: now })
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
