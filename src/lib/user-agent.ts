/**
 * Aus dem User-Agent wird "iPhone · Safari".
 *
 * Bewusst eine kurze Tabelle statt einer Parser-Bibliothek: die Angabe steht
 * in der Geraeteliste neben IP und letzter Aktivitaet und muss nur eine Frage
 * beantworten -- "ist das mein Telefon oder jemand anderes?". Dafuer reichen
 * die Handvoll Zeichenketten, die Browser seit Jahren mitschicken; ein
 * Fehlgriff kostet hier eine ungenaue Zeile, keinen falschen Zugriff.
 *
 * Reihenfolge ist alles: Chrome nennt sich auch Safari, Edge nennt sich auch
 * Chrome, und jedes iPad ab iPadOS 13 gibt sich im Desktop-Modus als
 * Macintosh aus. Die spezifischeren Muster stehen deshalb zuerst.
 */

export type DeviceKind = "phone" | "tablet" | "desktop";

export type DeviceDescription = {
  device: string;
  browser: string;
  kind: DeviceKind;
};

const DEVICES: { match: RegExp; device: string; kind: DeviceKind }[] = [
  { match: /iPhone/i, device: "iPhone", kind: "phone" },
  { match: /iPad/i, device: "iPad", kind: "tablet" },
  { match: /Android.*Mobile/i, device: "Android-Handy", kind: "phone" },
  { match: /Android/i, device: "Android-Tablet", kind: "tablet" },
  { match: /Macintosh|Mac OS X/i, device: "Mac", kind: "desktop" },
  { match: /Windows/i, device: "Windows", kind: "desktop" },
  { match: /CrOS/i, device: "Chromebook", kind: "desktop" },
  { match: /Linux/i, device: "Linux", kind: "desktop" },
];

const BROWSERS: { match: RegExp; browser: string }[] = [
  { match: /Edg[A-Z]?\//i, browser: "Edge" },
  { match: /OPR\/|Opera/i, browser: "Opera" },
  { match: /SamsungBrowser/i, browser: "Samsung Internet" },
  { match: /Firefox\/|FxiOS/i, browser: "Firefox" },
  { match: /CriOS/i, browser: "Chrome" },
  { match: /Chrome\//i, browser: "Chrome" },
  { match: /Safari\//i, browser: "Safari" },
];

export function describeUserAgent(
  userAgent: string | null | undefined,
): DeviceDescription {
  const value = userAgent?.trim();
  if (!value) {
    return { device: "Unbekanntes Gerät", browser: "", kind: "desktop" };
  }

  const device = DEVICES.find((entry) => entry.match.test(value));
  const browser = BROWSERS.find((entry) => entry.match.test(value));

  return {
    device: device?.device ?? "Unbekanntes Gerät",
    browser: browser?.browser ?? "",
    kind: device?.kind ?? "desktop",
  };
}

/** "iPhone · Safari", oder nur das Geraet, wenn der Browser nicht zu erkennen war. */
export function deviceLabel(description: DeviceDescription): string {
  return description.browser
    ? `${description.device} · ${description.browser}`
    : description.device;
}
