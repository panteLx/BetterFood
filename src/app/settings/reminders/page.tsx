"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Leaf, Minus, Plus } from "lucide-react";
import { SubPageHeader } from "@/components/sub-page-header";
import { InstallHintSettings } from "@/components/install-hint";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Switch } from "@/components/ui/switch";
import { addDays, daysUntil, formatMedium, startOfDay } from "@/lib/expiry";
import {
  subscribeToPush,
  unsubscribeFromPush,
  getNotificationPermissionState,
  hasPushSubscription,
} from "@/lib/push-client";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  LEAD_DAY_OPTIONS,
  NOTIFICATION_HOUR_MAX,
  NOTIFICATION_HOUR_MIN,
  NOTIFICATION_STAGES,
  STAGES,
  formatNotificationHour,
  notificationHour,
  type NotificationSettings,
  type Stage,
} from "@/lib/notification-settings";
import { notificationBody, notificationTitle } from "@/lib/notification-message";

type ReminderSettings = NotificationSettings & { lastSentAt: string | null };

/**
 * Wie lange nach dem letzten Tipp auf − oder + gespeichert wird.
 *
 * Der Schrittschalter lädt zum mehrfachen Drücken ein, und jeder Druck wäre
 * sonst eine eigene Anfrage -- von denen die zuletzt beantwortete gewinnt,
 * nicht die zuletzt gestellte. Von 9 auf 20 Uhr sprang die Anzeige damit
 * zwischendurch zurück.
 */
const TIME_SAVE_DELAY = 500;

const clockFormat = new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" });

/**
 * Beispielartikel für die Vorschau -- einer je Stufe, zwei für den Ablauftag,
 * damit der Titel auch seine Mehrzahl-Form zeigt. Die Vorschau baut ihren
 * Text mit denselben Funktionen wie der Versand: schaltet jemand eine Stufe
 * ab, verschwindet sie hier genauso wie später auf dem Sperrbildschirm.
 *
 * Mit MHD und nicht nur mit Namen, weil der Meldungstext bei genau einem
 * Artikel die Zeitangabe trägt. Das Beispiel der Vorwarnung hängt deshalb an
 * der gewählten Vorwarnzeit: wer auf "3 Tage vorher" tippt, soll in der
 * Vorschau "Noch 3 Tage" lesen und nicht eine erfundene Zahl.
 */
function previewItems(
  leadDays: number,
  today: Date,
): { item: { name: string; expiryDate: Date }; stage: Stage }[] {
  return [
    { item: { name: "Naturjoghurt", expiryDate: addDays(-3, today) }, stage: "expired" },
    { item: { name: "Vollmilch", expiryDate: today }, stage: "zero" },
    { item: { name: "Hackfleisch", expiryDate: today }, stage: "zero" },
    { item: { name: "Blattspinat", expiryDate: addDays(leadDays, today) }, stage: "lead" },
  ];
}

/** "Heute, 09:14" -- Zeilen aus PR 1 tragen nur ein Datum und bleiben ohne Uhrzeit. */
function formatLastSent(raw: string): string | null {
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const days = daysUntil(parsed);
  const day = days === 0 ? "Heute" : days === -1 ? "Gestern" : formatMedium(parsed);

  return raw.length === 10 ? day : `${day}, ${clockFormat.format(parsed)}`;
}

export default function RemindersPage() {
  const [settings, setSettings] = useState<ReminderSettings>({
    ...DEFAULT_NOTIFICATION_SETTINGS,
    lastSentAt: null,
  });
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<string>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  // Die entprellte Stunde: `timePending` ist die noch nicht bestätigte,
  // `timeBefore` die, auf die im Fehlerfall zurückgefallen wird.
  const timeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timePending = useRef<string | null>(null);
  const timeBefore = useRef<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data: ReminderSettings) => {
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

    return () => {
      if (timeTimer.current) clearTimeout(timeTimer.current);
    };
  }, []);

  /**
   * Jede Einstellung wirkt sofort und speichert sich selbst -- ein
   * Speichern-Knopf neben einem einzelnen Zahlenfeld war der Grund, warum
   * die Vorwarnzeit vorher praktisch nie verstellt wurde.
   */
  async function patch(change: Partial<NotificationSettings>) {
    // Eine noch nicht gespeicherte Stunde reist mit. Ohne das antwortete der
    // Server mit der alten Uhrzeit aus der Datenbank -- die Antwort ersetzt
    // den ganzen Zustand, die Anzeige sprang also zurück, während der
    // entprellte Lauf die neue Stunde gleich darauf doch schrieb. Danach
    // zeigte die Seite bis zum Neuladen etwas anderes an als gespeichert war.
    const pendingTime = timePending.current;
    if (timeTimer.current) {
      clearTimeout(timeTimer.current);
      timeTimer.current = null;
    }
    const rollbackTime = timeBefore.current;
    timePending.current = null;
    timeBefore.current = null;

    const previous = rollbackTime === null ? settings : { ...settings, time: rollbackTime };
    setSettings({ ...settings, ...change });
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pendingTime === null ? change : { time: pendingTime, ...change }),
      });
      if (!res.ok) throw new Error();
      setSettings(await res.json());
    } catch {
      toast.error("Konnte Einstellung nicht speichern.");
      setSettings(previous);
    }
  }

  /**
   * Wie patch, aber entprellt und ohne die Antwort zu übernehmen: die Anzeige
   * steht bereits auf dem zuletzt gedrückten Wert, und eine verspätet
   * eintreffende Antwort darf sie nicht auf einen älteren zurückziehen.
   */
  function stepHour(delta: number) {
    const next = notificationHour(settings.time) + delta;
    if (next < NOTIFICATION_HOUR_MIN || next > NOTIFICATION_HOUR_MAX) return;

    if (timeBefore.current === null) timeBefore.current = settings.time;
    const time = formatNotificationHour(next);
    timePending.current = time;
    setSettings((current) => ({ ...current, time }));

    if (timeTimer.current) clearTimeout(timeTimer.current);
    timeTimer.current = setTimeout(() => void saveTime(time), TIME_SAVE_DELAY);
  }

  async function saveTime(time: string) {
    const previous = timeBefore.current;
    timeTimer.current = null;
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Konnte Einstellung nicht speichern.");
      // Nicht zurückfallen, wenn inzwischen weitergedrückt oder eine andere
      // Einstellung gespeichert wurde: dann gilt deren Stunde, nicht diese.
      if (previous && timePending.current === time) {
        setSettings((current) => ({ ...current, time: previous }));
      }
    }
    if (timePending.current === time) {
      timePending.current = null;
      timeBefore.current = null;
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

  const hour = notificationHour(settings.time);
  // Getrennt von der Vorschau: die hängt an den Beispielartikeln und wäre als
  // Ersatzfrage nur so lange richtig, wie dort je Stufe ein Beispiel steht.
  const anyStage = STAGES.some((stage) => settings.stages[stage]);
  const today = startOfDay(new Date());
  const preview = previewItems(settings.leadDays, today).filter(
    (entry) => settings.stages[entry.stage],
  );
  const lastSent = settings.lastSentAt ? formatLastSent(settings.lastSentAt) : null;

  return (
    <div className="flex flex-1 flex-col gap-4.5 px-5 pt-2 pb-4">
      <SubPageHeader title="Erinnerungen" />

      <div className="overflow-hidden rounded-[24px] bg-card shadow-row">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="font-heading text-[15px] font-bold">Erinnerungen an</p>
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
      </div>

      {permission === "denied" && (
        <p className="rounded-lg bg-danger-tint px-4 py-3 text-[13px] leading-relaxed font-medium text-danger-ink">
          Die Berechtigung wurde verweigert – bitte in den Browser- oder
          Systemeinstellungen erlauben, dann hier erneut einschalten.
        </p>
      )}

      <InstallHintSettings />

      {/* Alle Anlässe in einer Karte, die Wochenübersicht eingeschlossen: sie
          beantwortet dieselbe Frage wie die drei Stufen ("wann meldet sich die
          App?") und stand vorher nur deshalb beim Geräte-Schalter, weil es die
          Stufen noch nicht gab. */}
      <section className="flex flex-col gap-2.5">
        <h2 className="pl-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Wann melden?
        </h2>
        <div className="overflow-hidden rounded-[24px] bg-card shadow-row">
          {STAGES.map((stage) => (
            <div
              key={stage}
              className="flex items-center gap-3 border-b border-hairline px-4 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <p className="font-heading text-[15px] font-bold">
                  {NOTIFICATION_STAGES[stage].label}
                </p>
                <p className="mt-0.5 text-[12.5px] leading-snug font-medium text-muted-foreground">
                  {NOTIFICATION_STAGES[stage].description}
                </p>
              </div>
              <Switch
                checked={settings.stages[stage]}
                disabled={loading}
                onCheckedChange={(value) =>
                  patch({ stages: { ...settings.stages, [stage]: value } })
                }
                aria-label={NOTIFICATION_STAGES[stage].label}
              />
            </div>
          ))}
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <p className="font-heading text-[15px] font-bold">Wochenübersicht</p>
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
        {/* Kein Fehler, sondern eine Folge -- deshalb eine ruhige Zeile und
            keine Warnfarbe. Ohne sie sucht man den Grund für die Stille zwei
            Wochen später beim Server. */}
        {!anyStage && (
          <p className="px-1 text-[13px] leading-relaxed font-medium text-muted-foreground">
            {settings.weeklySummary
              ? "So kommt nur noch sonntags die Wochenübersicht."
              : "So kommt gar keine Erinnerung mehr."}
          </p>
        )}
      </section>

      {/* Ohne Vorwarnung gibt es keinen Vorlauf mehr zu wählen. */}
      {settings.stages.lead && (
        <section className="flex flex-col gap-2.5">
          <h2 className="pl-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Vorlauf der Vorwarnung
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
      )}

      <section className="flex flex-col gap-2.5">
        <h2 className="pl-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Uhrzeit
        </h2>
        <div className="flex items-center justify-between rounded-[24px] bg-card p-2 shadow-row">
          <Button
            variant="ghost"
            size="icon-touch"
            onClick={() => stepHour(-1)}
            disabled={loading || hour <= NOTIFICATION_HOUR_MIN}
            aria-label="Eine Stunde früher"
            className="text-muted-foreground"
          >
            <Minus className="size-5" strokeWidth={2.2} />
          </Button>
          <span aria-live="polite" className="font-heading text-[17px] font-bold tabular-nums">
            {settings.time}
          </span>
          <Button
            variant="ghost"
            size="icon-touch"
            onClick={() => stepHour(1)}
            disabled={loading || hour >= NOTIFICATION_HOUR_MAX}
            aria-label="Eine Stunde später"
            className="text-muted-foreground"
          >
            <Plus className="size-5" strokeWidth={2.2} />
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-2.5">
        <h2 className="pl-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          So sieht das aus
        </h2>
        {/* Eine Vorschau statt einer Beschreibung: wer eine Erinnerung
            einschaltet, soll vorher sehen, was ihn nachts weckt. Titel und
            Text bauen dieselben Funktionen wie der Versand -- vorher stand
            hier ein fester Satz, der nach dem Abschalten einer Stufe eine
            Meldung versprach, die nie kommen würde. */}
        {preview.length > 0 && (
          <div className="flex gap-3 rounded-[20px] bg-surface-2 p-3.5">
            <span className="flex size-8.5 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Leaf className="size-4.5" strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex justify-between font-heading text-[12.5px] leading-none font-bold">
                <span>BetterFood</span>
                <span className="font-sans font-medium text-muted-foreground">jetzt</span>
              </div>
              <p className="mt-1.5 font-heading text-sm leading-snug font-bold">
                {notificationTitle(preview)}
              </p>
              <p className="mt-0.5 text-[13px] leading-snug font-medium text-balance text-muted-foreground">
                {notificationBody(preview, today)}
              </p>
            </div>
          </div>
        )}
        <Button
          variant="outline"
          onClick={sendTest}
          disabled={busy || !subscribed}
          className="h-12 w-full"
        >
          Testbenachrichtigung senden
        </Button>
        {/* Beantwortet "geht überhaupt etwas raus?", ohne dass jemand den Knopf
            darüber drücken muss. Der Wert ist der Merker, den der stündliche
            Lauf bei jeder zugestellten Erinnerung schreibt. */}
        <p className="px-1 text-[12.5px] leading-snug font-medium text-muted-foreground">
          {lastSent ? `Zuletzt gesendet: ${lastSent}` : "Bisher wurde nichts gesendet."}
        </p>
      </section>
    </div>
  );
}
