import { connection } from "next/server";

/**
 * Ist SSO konfiguriert? Alle drei Werte muessen da sein, sonst kann der
 * Anbieter weder gefunden noch angesprochen werden.
 *
 * Bewusst eine Funktion und keine Modulkonstante: gelesen wird erst beim
 * Aufruf, also im laufenden Container mit dessen Umgebung -- nicht in dem
 * Prozess, der irgendwann das Image gebaut hat.
 */
export function isOidcConfigured(): boolean {
  return Boolean(
    process.env.OIDC_ISSUER && process.env.OIDC_CLIENT_ID && process.env.OIDC_CLIENT_SECRET,
  );
}

/** Die Beschriftung der SSO-Schaltflaeche -- "Mit {Name} anmelden". */
export function oidcDisplayName(): string {
  const name =
    process.env.OIDC_DISPLAY_NAME?.trim() ||
    // Vorgaengername. Als NEXT_PUBLIC_ war er im Client-Bundle gebacken,
    // deshalb blieb die Schaltflaeche in einem fertigen Image fuer immer
    // aus. Er wird hier nur noch serverseitig gelesen, damit bestehende
    // .env-Dateien weiter funktionieren.
    process.env.NEXT_PUBLIC_OIDC_DISPLAY_NAME?.trim();

  return name || "SSO";
}

/**
 * Der Name fuer die Anmeldeseiten, oder null wenn es nichts anzubieten gibt.
 *
 * `connection()` nimmt die Auswertung aus dem Prerender heraus: ohne sie
 * stuende hier die Umgebung des Builds, und ein Image, das ohne OIDC gebaut
 * wurde, zeigte die Schaltflaeche auch dann nicht, wenn der Container sie
 * gesetzt bekommt.
 */
export async function getOidcDisplayName(): Promise<string | null> {
  await connection();
  return isOidcConfigured() ? oidcDisplayName() : null;
}
