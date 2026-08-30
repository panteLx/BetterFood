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
  applyDefaultCategoryPlaces,
  seedDefaultCategories,
  seedDefaultPlaces,
} from "@/lib/data";
import { isOidcConfigured, oidcDisplayName } from "@/lib/oidc";
import { isRegistrationOpen } from "@/lib/registration";

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

/**
 * Woher die Client-IP kommen darf.
 *
 * Ohne diese Angabe hatte better-auth genau zwei Ausgaenge, und beide waren
 * falsch. Haengt der Reverse Proxy an X-Forwarded-For an (das uebliche
 * $proxy_add_x_forwarded_for), stehen zwei Eintraege im Header, better-auth
 * ermittelt gar keine IP und faellt auf einen fuer ALLE Nutzer gemeinsamen
 * Zaehler zurueck -- ein einzelner Passwort-Rater sperrt damit jede Anmeldung
 * der Instanz aus. Steht dagegen genau ein Eintrag drin, wurde er ungeprueft
 * uebernommen und liess sich pro Anfrage frei setzen: gar kein Limit mehr.
 *
 * Mit TRUSTED_PROXIES laeuft better-auth die Kette von rechts nach links ab
 * und nimmt die erste Adresse, die NICHT aus diesen Netzen stammt; alles davor
 * hat der Client geschrieben und faellt weg. Erst das fuellt auch
 * session.ip_address, die /settings/account als "fremder Zugriff?"-Hinweis
 * anzeigt.
 *
 * TRUSTED_PROXIES ausdruecklich leer heisst: kein Proxy davor. Dann wird gar
 * kein Header mehr gelesen -- ein leeres trustedProxies allein wuerde genau in
 * das zweite Verhalten oben zurueckfallen, und ein faelschbares Limit ist
 * schlechter als ein grobes.
 */
function ipAddressOptions() {
  const raw = process.env.TRUSTED_PROXIES ?? "127.0.0.1/32,::1/128";
  const trustedProxies = raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (trustedProxies.length === 0) {
    return { ipAddressHeaders: [] };
  }

  return { trustedProxies };
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

  // Erst wenn beides steht, laesst sich das eine aufs andere zeigen.
  await applyDefaultCategoryPlaces(list.id);

  await db.update(user).set({ activeListId: list.id }).where(eq(user.id, newUser.id));
}

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "sqlite", schema }),
  emailAndPassword: {
    enabled: true,
    // Die Tuer faellt zu, sobald der Haushalt steht -- siehe lib/registration.ts.
    // Angemeldet wird weiter, nur neu angelegt nicht mehr. Der Riegel gehoert
    // hierher und nicht in den Proxy: /api/auth/sign-up/email liegt in dessen
    // Allowlist, weil eine Registrierung ohne Sitzung stattfindet.
    disableSignUp: !isRegistrationOpen(),
  },
  user: {
    // Ohne updateEmailWithoutVerification waere die Adresse hier unaenderbar:
    // better-auth laesst eine E-Mail-Aenderung sonst nur ueber einen
    // Bestaetigungslink zu, und dieses Projekt verschickt keine Mails -- es
    // gibt kein SMTP, keinen Versanddienst, nichts. Die Ausnahme greift genau
    // solange emailVerified false ist, und das ist hier bei jedem Konto der
    // Fall, weil nichts das Flag je setzt. Wer spaeter eine Verifikation
    // nachruestet, nimmt diesem Pfad still den Boden weg -- dann muss die
    // Aenderung ueber sendChangeEmailConfirmation laufen.
    //
    // Abgesichert ist sie trotzdem: POST /api/account/email verlangt vorher
    // das aktuelle Passwort, und ohne Passwort-Konto (SSO) ist sie gesperrt.
    changeEmail: { enabled: true, updateEmailWithoutVerification: true },
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
  advanced: { ipAddress: ipAddressOptions() },
  plugins: isOidcConfigured()
    ? [
        genericOAuth({
          config: [
            {
              providerId: "oidc",
              name: oidcDisplayName(),
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
