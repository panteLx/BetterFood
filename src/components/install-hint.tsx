"use client";

import { useState, useSyncExternalStore } from "react";
import { Upload, X } from "lucide-react";

const DISMISS_KEY = "vorrat:install-hint-dismissed";

// Kein Abonnement noetig: beides aendert sich innerhalb einer Sitzung nicht.
const noopSubscribe = () => () => {};

function readNeedsInstall() {
  const ua = navigator.userAgent;
  const isIOS =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS meldet sich seit Version 13 als Mac -- nur der Touch-Support
    // unterscheidet es noch von einem echten Desktop-Safari.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  return isIOS && !standalone;
}

/**
 * Auf iOS liefert Web Push ausschliesslich, wenn die App zum Home-Bildschirm
 * hinzugefuegt wurde. Im Safari-Tab bleibt "Benachrichtigungen aktivieren"
 * wirkungslos, ohne dass der Nutzer erfaehrt, warum. Da die Ablauf-Erinnerung
 * die gesamte Rueckkehr-Mechanik der App traegt, ist dieser Hinweis faktisch
 * der wichtigste Teil davon.
 */
function useNeedsInstall() {
  // Server-Snapshot false: waehrend des Prerenders ist weder das Geraet noch
  // der Anzeigemodus bekannt, und ein faelschlich sichtbarer Hinweis waere
  // schlimmer als einer, der einen Tick spaeter erscheint.
  return useSyncExternalStore(noopSubscribe, readNeedsInstall, () => false);
}

/** Ausführliche Variante für die Einstellungsseite. */
export function InstallHintSettings() {
  const needsInstall = useNeedsInstall();
  if (!needsInstall) return null;

  return (
    <div className="flex items-start gap-3 rounded-3xl border border-border bg-card px-4 py-3.5">
      <Upload className="mt-0.5 size-5 shrink-0 text-primary" strokeWidth={1.8} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold">Zum Home-Bildschirm</p>
        <p className="mt-1 text-[12.5px] leading-relaxed font-medium text-balance text-muted-foreground">
          BetterFood läuft im Browser. Einmal über <span className="font-semibold">Teilen › Zum
          Home-Bildschirm</span> installiert, startet es wie eine App – und darf Erinnerungen
          schicken.
        </p>
      </div>
    </div>
  );
}

/**
 * Kurze, einmal wegklickbare Variante für die Startseite. Erscheint erst,
 * wenn im Vorrat schon etwas liegt -- vorher hat der Nutzer noch keinen Grund,
 * an Erinnerungen interessiert zu sein.
 */
export function InstallHintBanner() {
  const needsInstall = useNeedsInstall();
  const previouslyDismissed = useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return localStorage.getItem(DISMISS_KEY) === "1";
      } catch {
        // Privater Modus o.ä. -- dann zeigen wir den Hinweis eben jedes Mal.
        return false;
      }
    },
    () => true,
  );
  const [dismissedNow, setDismissedNow] = useState(false);

  function dismiss() {
    setDismissedNow(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nicht speicherbar ist kein Grund, den Hinweis stehen zu lassen.
    }
  }

  if (!needsInstall || previouslyDismissed || dismissedNow) return null;

  return (
    <div className="flex items-start gap-3 rounded-[20px] bg-primary-tint p-3.5">
      <span className="flex size-8.5 shrink-0 items-center justify-center rounded-[11px] bg-primary text-primary-foreground">
        <Upload className="size-4.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] leading-snug font-bold text-accent-foreground">
          Zum Home-Bildschirm hinzufügen
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed font-medium text-balance text-accent-foreground/80">
          Teilen-Symbol antippen, dann „Zum Home-Bildschirm“. Nur so kommen Erinnerungen an.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hinweis ausblenden"
        className="flex size-7 shrink-0 items-center justify-center rounded-[9px] text-accent-foreground opacity-65 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <X className="size-3.5" strokeWidth={2.4} />
      </button>
    </div>
  );
}
