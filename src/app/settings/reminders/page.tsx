"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Leaf } from "lucide-react";
import { SubPageHeader } from "@/components/sub-page-header";
import { InstallHintSettings } from "@/components/install-hint";
import { Chip } from "@/components/ui/chip";
import { Switch } from "@/components/ui/switch";
import {
  subscribeToPush,
  unsubscribeFromPush,
  getNotificationPermissionState,
  hasPushSubscription,
} from "@/lib/push-client";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  LEAD_DAY_OPTIONS,
  NOTIFICATION_TIMES,
  type NotificationSettings,
} from "@/lib/notification-settings";

export default function RemindersPage() {
  const [settings, setSettings] = useState<NotificationSettings>(
    DEFAULT_NOTIFICATION_SETTINGS,
  );
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<string>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: NotificationSettings) => {
        setSettings(data);
        setPermission(getNotificationPermissionState());
      })
      .finally(() => setLoading(false));

    // Nicht an der Berechtigung allein festmachen: die bleibt erteilt, auch
    // wenn dieses Gerät gar keine Subscription (mehr) hat. Sonst bot die
    // Seite eine Testbenachrichtigung an, die serverseitig ins Leere lief.
    void hasPushSubscription().then(setSubscribed);
    // Den stillen Abgleich einer bereits erteilten Berechtigung übernimmt
    // <PushSync /> im Root-Layout -- er muss auf jeder Seite laufen, nicht
    // nur hier, weil das Abmelden die Subscription löscht.
  }, []);

  /**
   * Jede Einstellung wirkt sofort und speichert sich selbst -- ein
   * Speichern-Knopf neben einem einzelnen Zahlenfeld war der Grund, warum
   * die Vorwarnzeit vorher praktisch nie verstellt wurde.
   */
  async function patch(change: Partial<NotificationSettings>) {
    const previous = settings;
    setSettings({ ...settings, ...change });
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!res.ok) throw new Error();
      setSettings(await res.json());
    } catch {
      toast.error("Konnte Einstellung nicht speichern.");
      setSettings(previous);
    }
  }

  async function togglePush(next: boolean) {
    setBusy(true);
    try {
      if (next) {
        const ok = await subscribeToPush();
        setPermission(getNotificationPermissionState());
        setSubscribed(await hasPushSubscription());
        if (!ok)
          toast.error("Benachrichtigungen konnten nicht aktiviert werden.");
      } else {
        const ok = await unsubscribeFromPush();
        setSubscribed(await hasPushSubscription());
        if (!ok) toast.error("Konnte Benachrichtigungen nicht abmelden.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    try {
      const res = await fetch("/api/push/test", { method: "POST" });
      const data = (await res.json().catch(() => null)) as {
        sent?: number;
        error?: string;
      } | null;

      // Den Grund vom Server durchreichen: "konnte nicht gesendet werden" war
      // die einzige Rückmeldung, egal ob die Subscription fehlte, die
      // VAPID-Schlüssel oder der Push-Dienst.
      if (!res.ok || !data?.sent) {
        toast.error(
          data?.error ?? "Testbenachrichtigung konnte nicht gesendet werden.",
        );
        setSubscribed(await hasPushSubscription());
        return;
      }
      toast.success("Testbenachrichtigung gesendet");
    } catch {
      toast.error("Testbenachrichtigung konnte nicht gesendet werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4.5 px-5 pt-2 pb-4">
      <SubPageHeader title="Erinnerungen" />

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Erinnerungen an</p>
            <p className="mt-0.5 text-[12.5px] leading-snug font-medium text-muted-foreground">
              Push auf dieses Gerät
            </p>
          </div>
          <Switch
            checked={subscribed}
            disabled={busy || permission === "denied"}
            onCheckedChange={togglePush}
            aria-label="Erinnerungen auf diesem Gerät"
          />
        </div>
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold">Wochenübersicht</p>
            <p className="mt-0.5 text-[12.5px] leading-snug font-medium text-muted-foreground">
              Sonntags, was diese Woche fällig ist
            </p>
          </div>
          <Switch
            checked={settings.weeklySummary}
            disabled={loading}
            onCheckedChange={(value) => patch({ weeklySummary: value })}
            aria-label="Wochenübersicht"
          />
        </div>
      </div>

      {permission === "denied" && (
        <p className="rounded-lg bg-danger-tint px-4 py-3 text-[13px] leading-relaxed font-medium text-danger">
          Die Berechtigung wurde verweigert – bitte in den Browser- oder
          Systemeinstellungen erlauben, dann hier erneut einschalten.
        </p>
      )}

      <InstallHintSettings />

      <section className="flex flex-col gap-2.5">
        <h2 className="pl-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Wie früh?
        </h2>
        <div className="flex gap-2">
          {LEAD_DAY_OPTIONS.map((option) => (
            <Chip
              key={option.days}
              active={settings.leadDays === option.days}
              disabled={loading}
              onClick={() => patch({ leadDays: option.days })}
              className="h-10 flex-1 px-1 text-[12.5px]"
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="pl-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Uhrzeit
        </h2>
        <div className="flex gap-2">
          {NOTIFICATION_TIMES.map((time) => (
            <Chip
              key={time}
              active={settings.time === time}
              disabled={loading}
              onClick={() => patch({ time })}
              className="h-10 flex-1 px-1"
            >
              {time}
            </Chip>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="pl-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          So sieht das aus
        </h2>
        {/* Eine Vorschau statt einer Beschreibung: wer eine Erinnerung
            einschaltet, soll vorher sehen, was ihn nachts weckt. Titel und
            Text stehen hier genau so, wie expiry-check.ts sie baut -- vorher
            versprach die Vorschau Menge, Ort und "Tippen, um als aufgebraucht
            zu markieren", und nichts davon gab es je. */}
        <div className="flex gap-3 rounded-[20px] border border-border bg-surface-2 p-3.5">
          <span className="flex size-8.5 shrink-0 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
            <Leaf className="size-4.5" strokeWidth={1.7} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex justify-between text-[12.5px] leading-none font-bold">
              <span>BetterFood</span>
              <span className="font-medium text-muted-foreground">jetzt</span>
            </div>
            <p className="mt-1.5 text-sm leading-snug font-bold">
              1 abgelaufen, 2 laufen heute ab
            </p>
            <p className="mt-0.5 text-[13px] leading-snug font-medium text-balance text-muted-foreground">
              Naturjoghurt, Vollmilch, Hackfleisch
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={sendTest}
          disabled={busy || !subscribed}
          className="h-12 rounded-lg border border-border bg-card text-sm font-semibold disabled:opacity-50"
        >
          Testbenachrichtigung senden
        </button>
      </section>
    </div>
  );
}
