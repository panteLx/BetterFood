/**
 * Der Name des Haushalts, den jemand bei der Registrierung angibt.
 *
 * Er wird genau einmal gebraucht -- fuer die erste Liste -- und hat deshalb
 * bewusst keine eigene Spalte an der Nutzertabelle: eine zweite Kopie waere
 * in dem Moment falsch, in dem die Liste umbenannt wird.
 *
 * Beim Anmelden per SSO ueberlebt er die Runde zum Anbieter nicht im
 * Anfragekoerper -- dafuer ist das Cookie da. Zehn Minuten reichen fuer den
 * Weg hin und zurueck; laenger soll es nicht herumliegen.
 */
export const DEFAULT_HOUSEHOLD_NAME = "Zuhause";

export const HOUSEHOLD_COOKIE = "bf_household";

export const HOUSEHOLD_COOKIE_MAX_AGE = 600;

/** Die Registrierung ist ohne Anmeldung erreichbar, daher die Begrenzung. */
const MAX_LENGTH = 60;

export function normalizeHouseholdName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, MAX_LENGTH) || null;
}
