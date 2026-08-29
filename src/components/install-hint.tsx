"use client";

import { useState, useSyncExternalStore } from "react";
import { Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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

function Steps() {
  return (
    <ol className="flex list-decimal flex-col gap-1 pl-4 text-sm text-muted-foreground">
      <li>
        In Safari unten auf <span className="font-medium text-foreground">Teilen</span> tippen
        <Share className="mx-1 inline size-3.5 align-[-2px]" />
      </li>
      <li>
        <span className="font-medium text-foreground">Zum Home-Bildschirm</span> wählen
      </li>
      <li>Vorrat künftig über das neue Symbol öffnen</li>
    </ol>
  );
}

/** Ausführliche Variante für die Einstellungsseite. */
export function InstallHintSettings() {
  const needsInstall = useNeedsInstall();
  if (!needsInstall) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-input p-3">
      <p className="text-sm font-medium">Erinnerungen brauchen die installierte App</p>
      <p className="text-sm text-muted-foreground">
        Auf dem iPhone kann Safari Benachrichtigungen nur senden, wenn Vorrat auf dem
        Home-Bildschirm liegt.
      </p>
      <Steps />
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
    <div className="mx-4 flex items-start gap-2 rounded-lg border border-input p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-sm font-medium">Erinnerungen einschalten</p>
        <p className="text-sm text-muted-foreground">
          Damit Vorrat dich vor dem Ablaufdatum benachrichtigen kann, muss die App auf dem
          Home-Bildschirm liegen.
        </p>
        <Steps />
      </div>
      <Button
        size="icon-touch"
        variant="ghost"
        aria-label="Hinweis ausblenden"
        onClick={dismiss}
      >
        <X className="size-4" />
      </Button>
    </div>
  );
}
