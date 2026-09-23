"use client";

/**
 * Der eine Schalter des Scanners: fragt das MHD gleich nach dem Code ab.
 *
 * Aus ist der bisherige Ablauf -- sammeln, danach einmal durchgehen. An heißt,
 * dass nach jedem neuen Code das Prüf-Blatt aufgeht und man Artikel für Artikel
 * fertig macht. Beides bleibt mischbar: der Schalter steuert nur, ob das Blatt
 * von selbst aufgeht, nicht ob es das darf.
 *
 * ## Warum `localStorage` und nicht die settings-Tabelle
 *
 * Erinnerungen und Monatsziel gehören dem Haushalt, das hier gehört dem Gerät:
 * wie jemand sein Telefon beim Einräumen hält, ist keine Absprache mit den
 * Mitbewohnern. Dazu kommt der praktische Grund -- `localStorage` ist synchron
 * lesbar. Der Wert muss schon stehen, wenn der erste Code gelesen wird, und er
 * wird aus dem Decoder-Callback heraus abgefragt, der außerhalb des Rendern
 * lebt. Eine Server-Einstellung hieße: Kamera läuft, Antwort kommt später, und
 * der erste Scan verhält sich anders als der zweite.
 *
 * Dieselbe Entscheidung wie in `install-hint.tsx` und `reminder-hint.tsx`, und
 * dasselbe Speicher-Muster wie in `review-batch.ts`: ein Wert außerhalb von
 * React, über `useSyncExternalStore` angebunden, damit es keine zweite Kopie
 * gibt, die veralten kann. Genau darauf kommt es hier an, denn `/scan` bleibt
 * unter Cache Components per <Activity> am Leben.
 */

import { useSyncExternalStore } from "react";

export const SCAN_AUTO_EXPIRY_KEY = "bf.scan.auto-expiry.v1";

let cached: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SCAN_AUTO_EXPIRY_KEY) === "1";
  } catch {
    // Safari im privaten Modus wirft hier, statt null zu liefern. Dann gilt
    // eben die Vorgabe -- unschön, aber kein Grund, den Scanner zu töten.
    return false;
  }
}

function getSnapshot(): boolean {
  cached ??= read();
  return cached;
}

/** Auf dem Server gibt es keinen Speicher, also gilt dort die Vorgabe. */
function getServerSnapshot(): boolean {
  return false;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Der Schalter, reaktiv. Nur in Client-Komponenten. */
export function useAutoExpiry(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Der Schalter, ohne React.
 *
 * Für den Decoder-Callback: @zxing/browser bekommt ihn genau einmal je
 * Kamerastart übergeben, er schließt also über die Werte des Rendern, in dem
 * er entstanden ist. Über den Hook-Wert sähe er einen Umschalter mitten im
 * Einkauf nie.
 */
export function readAutoExpiry(): boolean {
  return getSnapshot();
}

export function setAutoExpiry(next: boolean): void {
  cached = next;
  try {
    if (next) {
      window.localStorage.setItem(SCAN_AUTO_EXPIRY_KEY, "1");
    } else {
      // Aus ist die Vorgabe und braucht keine Zeile: "0" abzulegen hieße,
      // zwischen "hat sich dagegen entschieden" und "war noch nie hier" zu
      // unterscheiden, und das tut hier niemand.
      window.localStorage.removeItem(SCAN_AUTO_EXPIRY_KEY);
    }
  } catch {
    // Gesperrter Speicher: der Schalter gilt dann nur für diesen Besuch.
  }
  for (const listener of listeners) listener();
}
