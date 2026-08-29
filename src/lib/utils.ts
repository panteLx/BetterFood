import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Nimmt einen ?redirect=-Parameter entgegen und gibt ihn nur zurueck, wenn er
 * ein app-interner Pfad ist. Ohne diese Pruefung koennte ein praeparierter
 * Link ("//example.com") nach dem Login auf eine fremde Seite fuehren.
 */
export function safeRedirect(target: string | null | undefined, fallback = "/") {
  if (!target) return fallback;
  if (!target.startsWith("/") || target.startsWith("//")) return fallback;
  return target;
}

/** Haengt einen bestehenden Redirect an einen Auth-Pfad an, falls vorhanden. */
export function withRedirect(path: string, redirect: string | null | undefined) {
  if (!redirect) return path;
  return `${path}?redirect=${encodeURIComponent(safeRedirect(redirect))}`;
}

/**
 * Vergleichsform eines Produktnamens: "Milch", "milch " und "Milch  " sind
 * derselbe Artikel. Wird sowohl beim Zusammenfassen gleicher Eintraege als
 * auch beim Wiedererkennen bereits einsortierter Produkte verwendet.
 */
export function normalizeProductName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
