"use client";

import { useSyncExternalStore } from "react";

// Kein Abonnement noetig: der Wert wechselt genau einmal, bei der Hydration.
const noopSubscribe = () => () => {};
// getSnapshot MUSS bei gleichem Zustand denselben Wert liefern, sonst rendert
// React endlos -- deshalb zwei Konstanten statt eines Objekts.
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/**
 * False auf dem Server und im ersten Client-Render.
 *
 * Gebraucht ueberall dort, wo eine Anzeige von new Date() abhaengt: ein
 * solcher "unstable value" im Server-Render bricht den Prerender der Route
 * ab. Hinter diesem Flag laeuft die Rechnung ausschliesslich im Client.
 */
export function useIsClient() {
  return useSyncExternalStore(noopSubscribe, clientSnapshot, serverSnapshot);
}
