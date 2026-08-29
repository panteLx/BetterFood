"use client";

import { useSyncExternalStore } from "react";
import { estimateExpiryDate } from "@/lib/categories";

// Kein Abonnement noetig: der Wert steht ab dem ersten Client-Render fest.
const noopSubscribe = () => () => {};

/**
 * Zeigt das geschaetzte Haltbarkeitsdatum fuer den Gast-Zweig von /confirm.
 *
 * Bewusst erst im Client berechnet: estimateExpiryDate ruft new Date() auf,
 * und ein solcher "unstable value" im Server-Render laesst Next den Prerender
 * der Route abbrechen ("Route /confirm: Next.js encountered the unstable value
 * `new Date()` while prerendering"). Ueber useSyncExternalStore liefert der
 * Server-Snapshot null, waehrend der Client den echten Wert berechnet -- die
 * Seitenhuelle bleibt damit vorgerendert, und ausgerechnet der Gast-Pfad ist
 * der Ersteindruck der App.
 */
export function EstimatedExpiry({ shelfLifeDays }: { shelfLifeDays: number }) {
  const formatted = useSyncExternalStore(
    noopSubscribe,
    () =>
      estimateExpiryDate(shelfLifeDays).toLocaleDateString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      }),
    () => null,
  );

  if (!formatted) return null;
  return <p>Voraussichtlich haltbar bis ca. {formatted}</p>;
}
