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

/*
 * The chosen camera, per device like the switch above. `null` means automatic: the browser picks
 * a back camera and may switch lenses on its own. The label is kept because Safari does not
 * always keep deviceIds stable across launches; the scanner finds the lens again by name.
 */
export const SCAN_CAMERA_KEY = "bf.scan.camera.v1";

export type ScanCamera = { deviceId: string; label: string };

let cachedCamera: ScanCamera | null | undefined;

function readCamera(): ScanCamera | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SCAN_CAMERA_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (
      parsed &&
      typeof parsed === "object" &&
      "deviceId" in parsed &&
      "label" in parsed &&
      typeof parsed.deviceId === "string" &&
      typeof parsed.label === "string"
    ) {
      return { deviceId: parsed.deviceId, label: parsed.label };
    }
    return null;
  } catch {
    return null;
  }
}

function getCameraSnapshot(): ScanCamera | null {
  if (cachedCamera === undefined) cachedCamera = readCamera();
  return cachedCamera;
}

function getCameraServerSnapshot(): ScanCamera | null {
  return null;
}

export function useScanCamera(): ScanCamera | null {
  return useSyncExternalStore(subscribe, getCameraSnapshot, getCameraServerSnapshot);
}

export function setScanCamera(camera: ScanCamera | null): void {
  cachedCamera = camera;
  try {
    if (camera) {
      window.localStorage.setItem(SCAN_CAMERA_KEY, JSON.stringify(camera));
    } else {
      window.localStorage.removeItem(SCAN_CAMERA_KEY);
    }
  } catch {
    // Blocked storage: the choice holds for this visit only.
  }
  for (const listener of listeners) listener();
}
