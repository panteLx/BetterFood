import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { account, pushSubscriptions } from "@/db/schema";

/**
 * Womit meldet sich dieser Mensch eigentlich an?
 *
 * Nicht zu verwechseln mit lib/oidc.ts: das beantwortet, ob SSO auf diesem
 * Server ueberhaupt eingerichtet ist. Hier geht es um das einzelne Konto --
 * ein Server kann SSO anbieten, und trotzdem meldet sich die Haelfte des
 * Haushalts mit E-Mail und Passwort an.
 *
 * Die Unterscheidung haengt an einer credential-Zeile mit gesetztem Passwort,
 * nicht am Provider-Namen: better-auth legt fuer SSO-Konten schlicht keine an.
 * Wer keine hat, hat kein Passwort, das man aendern koennte, und keine
 * E-Mail, die dieser Server verwaltet -- beide Regeln stehen deshalb hier und
 * nicht verstreut in den Routen.
 */
export const CREDENTIAL_PROVIDER = "credential";

export type AccountAccess = {
  /** Alle Anmeldewege dieses Kontos, z. B. ["credential"] oder ["oidc"]. */
  providers: string[];
  /** Nur damit sind E-Mail und Passwort auf diesem Server aenderbar. */
  hasPassword: boolean;
};

export async function readAccountAccess(userId: string): Promise<AccountAccess> {
  const rows = await db
    .select({ providerId: account.providerId, password: account.password })
    .from(account)
    .where(eq(account.userId, userId));

  return {
    providers: rows.map((row) => row.providerId),
    hasPassword: rows.some(
      (row) => row.providerId === CREDENTIAL_PROVIDER && Boolean(row.password),
    ),
  };
}

/**
 * Push-Anmeldungen ohne Sitzung wegraeumen.
 *
 * Die Bindung an eine Sitzung gibt es erst seit Migration 0011; alles, was
 * davor angelegt wurde, traegt NULL und wuerde einen Rauswurf ueberleben --
 * ausgerechnet im wichtigsten Fall, dem alten Telefon, das nie wieder
 * geoeffnet wird und sich deshalb auch nie neu bindet. Zuzuordnen sind diese
 * Zeilen nicht mehr, also fallen sie beim Abmelden eines Geraets mit; das
 * eigene Geraet meldet sich unmittelbar danach neu an (syncPushSubscription
 * in account-manager.tsx). Der Preis ist eine stumme Erinnerung auf einem
 * dritten, noch angemeldeten Altgeraet bis zu dessen naechstem Oeffnen -- das
 * ist weniger schlimm als ein Rauswurf, der nicht haelt, was der Dialog
 * verspricht.
 */
export function dropUnboundPushSubscriptions(userId: string) {
  return db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        isNull(pushSubscriptions.sessionId),
      ),
    );
}
