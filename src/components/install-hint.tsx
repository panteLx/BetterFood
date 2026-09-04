"use client";

import { useState, useSyncExternalStore } from "react";
import { Upload, X } from "lucide-react";
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
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;

  return isIOS && !standalone;
}

/**
 * Auf iOS liefert Web Push ausschliesslich, wenn die App zum Home-Bildschirm
 * hinzugefuegt wurde. Im Safari-Tab bleibt "Benachrichtigungen aktivieren"
 * wirkungslos, ohne dass der Nutzer erfaehrt, warum. Da die Ablauf-Erinnerung
 * die gesamte Rueckkehr-Mechanik der App traegt, ist dieser Hinweis faktisch
 * der wichtigste Teil davon.
 */
export function useNeedsInstall() {
  // Server-Snapshot false: waehrend des Prerenders ist weder das Geraet noch
  // der Anzeigemodus bekannt, und ein faelschlich sichtbarer Hinweis waere
  // schlimmer als einer, der einen Tick spaeter erscheint.
  return useSyncExternalStore(noopSubscribe, readNeedsInstall, () => false);
}

/**
 * Ausführliche Variante fuer die Erinnerungs-Seite -- inklusive Abschnitts-
 * ueberschrift, damit auf einem Geraet ohne diesen Fall keine leere
 * Ueberschrift ohne Inhalt stehen bleibt.
 *
 * Sie steht bewusst nur dort und nicht mehr zusaetzlich auf der Verteiler-
 * seite: derselbe Kasten zweimal untereinander in denselben Einstellungen
 * las sich wie ein Fehler, und er gehoert an die Stelle, an der der Nutzer
 * die Erinnerungen einschalten will -- dort ist die Installation die
 * Bedingung dafuer, nicht eine allgemeine Empfehlung.
 */
export function InstallHintSettings() {
  const needsInstall = useNeedsInstall();
  if (!needsInstall) return null;

  return (
    <section className="flex flex-col gap-2">
      <h2 className="label-caps">
        Auf dem Gerät
      </h2>
      <div className="flex items-start gap-3 rounded-[24px] bg-card px-4 py-3.5 shadow-row">
        <Upload
          className="mt-0.5 size-5 shrink-0 text-primary"
          strokeWidth={1.8}
        />
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[15px] font-bold">
            Zum Home-Bildschirm hinzufügen
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed font-medium text-balance text-muted-foreground">
            BetterFood läuft gerade im Browser, und iOS liefert
            Benachrichtigungen nur an installierte Apps. Teilen-Symbol antippen,
            dann <span className="font-semibold">„Zum Home-Bildschirm“</span>{" "}
            zum Installieren. Nur so kommen Erinnerungen an.
          </p>
        </div>
      </div>
    </section>
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
      <span className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Upload className="size-4.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-[13.5px] leading-snug font-bold text-accent-foreground">
          Zum Home-Bildschirm hinzufügen
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed font-medium text-balance text-accent-foreground/80">
          Teilen-Symbol antippen, dann „Zum Home-Bildschirm“ zum Installieren.
          Nur so kommen Erinnerungen an.
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={dismiss}
        aria-label="Hinweis ausblenden"
        className="shrink-0 text-accent-foreground opacity-65 hover:bg-primary/15 hover:text-accent-foreground"
      >
        <X className="size-3.5" strokeWidth={2.4} />
      </Button>
    </div>
  );
}
