"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, X } from "lucide-react";
import { useNeedsInstall } from "@/components/install-hint";
import { Button } from "@/components/ui/button";
import {
  getNotificationPermissionState,
  hasPushSubscription,
  subscribeToPush,
} from "@/lib/push-client";

const DISMISS_KEY = "vorrat:reminder-hint-dismissed";

/**
 * Der Hinweis auf der Startseite, dass es Erinnerungen gibt.
 *
 * Die gesamte Rueckkehr-Mechanik der App haengt an der Push-Nachricht: wer
 * nicht erfaehrt, dass sie existiert, macht die App erst wieder auf, wenn der
 * Joghurt schon schlecht ist. Bisher stand das Angebot ausschliesslich unter
 * Einstellungen › Erinnerungen -- also genau dort, wo niemand vorbeikommt,
 * der noch nicht weiss, dass es etwas einzuschalten gibt.
 *
 * Er erscheint nur, wenn tatsaechlich etwas zu tun ist:
 *  - der Browser kann Push (sonst waere es ein leeres Versprechen),
 *  - die Berechtigung wurde weder erteilt noch verweigert -- oder sie ist
 *    erteilt, aber dieses Geraet hat keine Subscription (nach dem Abmelden,
 *    nach geloeschten Website-Daten),
 *  - und auf iOS im Browser-Tab steht stattdessen der Installations-Hinweis,
 *    weil das Einschalten dort gar nicht funktionieren wuerde.
 *
 * Einmal weggeklickt bleibt er weg; das Angebot steht danach weiterhin in den
 * Einstellungen.
 */
export function ReminderHintBanner() {
  const needsInstall = useNeedsInstall();
  const [offer, setOffer] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        if (localStorage.getItem(DISMISS_KEY) === "1") return;
      } catch {
        // Privater Modus o.ä. -- dann zeigen wir den Hinweis eben wieder.
      }

      const permission = getNotificationPermissionState();
      if (permission === "unsupported" || permission === "denied") return;
      // Die erteilte Berechtigung allein genuegt nicht: sie ueberlebt das
      // Abmelden, die Subscription nicht.
      if (permission === "granted" && (await hasPushSubscription())) return;
      if (active) setOffer(true);
    }

    void check();
    return () => {
      active = false;
    };
  }, []);

  async function enable() {
    setBusy(true);
    try {
      const ok = await subscribeToPush();
      if (!ok) {
        toast.error("Benachrichtigungen konnten nicht aktiviert werden.");
        return;
      }
      toast.success("Erinnerungen eingeschaltet");
      setOffer(false);
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    setOffer(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Nicht speicherbar ist kein Grund, den Hinweis stehen zu lassen.
    }
  }

  if (needsInstall || !offer) return null;

  return (
    <div className="flex items-start gap-3 rounded-[20px] bg-primary-tint p-3.5">
      <span className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Bell className="size-4.5" strokeWidth={2} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-heading text-[13.5px] leading-snug font-bold text-accent-foreground">
          Erinnerungen einschalten
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed font-medium text-balance text-accent-foreground/80">
          BetterFood meldet sich, bevor etwas abläuft – sonst merkst du es erst
          beim Aufmachen.
        </p>
        <Button onClick={enable} disabled={busy} className="mt-2.5 h-9 px-3.5 text-[13px]">
          {busy ? "Einen Moment…" : "Erinnerungen einschalten"}
        </Button>
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
