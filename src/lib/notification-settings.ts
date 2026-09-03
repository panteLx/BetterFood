/**
 * Die persönlichen Erinnerungs-Einstellungen: zu welchen Anlässen überhaupt
 * eine Meldung kommt, wie früh die Vorwarnung, zu welcher Uhrzeit, und ob
 * sonntags eine Wochenübersicht dazukommt.
 *
 * Schlüssel und Standardwerte stehen hier zusammen, weil sie an drei Stellen
 * gebraucht werden -- in der API, in der Einstellungsseite und im Cron-Job.
 * Der Schlüssel notification_lead_days ist absichtlich unverändert
 * geblieben: bestehende Zeilen sollen ihre Bedeutung behalten.
 *
 * Diese Datei bleibt frei von Datenbankzugriffen, damit die Einstellungsseite
 * sie als Client-Komponente importieren kann; dasselbe Muster wie
 * monthly-goal.ts.
 */

/**
 * Die drei Anlässe, zu denen ein Artikel etwas zu sagen hat.
 *
 * Vorher gab es nur einen: "liegt unter der Vorwarnschwelle" -- und weil die
 * Schwelle mehrere Tage umfasst, meldete sich dieselbe Ware an jedem dieser
 * Tage mit exakt demselben Satz. Die Stufe macht aus dem Zustand ein
 * Ereignis: jede sagt etwas anderes, und jede sagt es einmal.
 */
export type Stage = "lead" | "zero" | "expired";

/** Chronologisch -- die Reihenfolge, in der die Schalter auf der Seite stehen. */
export const STAGES: Stage[] = ["lead", "zero", "expired"];

/**
 * Anlass -> Schlüssel, Voreinstellung und Beschriftung.
 *
 * Als Karte und nicht als drei flache Schlüssel mit je einem handgeschriebenen
 * Zweig in der API: die Einstellungsseite rendert ihre Schalter daraus, die
 * API prüft dagegen, und der Versandweg fragt sie ab. Ein weiterer Anlass
 * (Monatsziel erreicht, jemand hat etwas eingetragen, Einladung zu einer
 * Liste) ist damit ein Eintrag statt vier Stellen.
 *
 * "Abgelaufen" deckt die Meldung am Tag danach und die wöchentliche
 * Wiedervorlage zusammen ab -- ein Schalter unter einem Schalter wäre für
 * denselben Sachverhalt eine Stufe zu viel.
 */
export const NOTIFICATION_STAGES: Record<
  Stage,
  { key: string; default: boolean; label: string; description: string }
> = {
  lead: {
    key: "notification_stage_lead",
    default: true,
    label: "Vorwarnung",
    description: "Einmal vorab, so früh wie unten gewählt",
  },
  zero: {
    key: "notification_stage_zero",
    default: true,
    label: "Ablauftag",
    description: "Am letzten Tag, an dem sich noch etwas retten lässt",
  },
  expired: {
    key: "notification_stage_expired",
    default: true,
    label: "Abgelaufen",
    description: "Am Tag danach, dann wöchentlich",
  },
};

export const NOTIFICATION_KEYS = {
  leadDays: "notification_lead_days",
  time: "notification_time",
  weeklySummary: "notification_weekly_summary",
} as const;

/**
 * Wann dieses Mitglied zuletzt überhaupt eine Erinnerung bekommen hat --
 * geschrieben vom Cron-Job, gelesen von der Einstellungsseite als "Zuletzt
 * gesendet". Steht hier bei den übrigen Schlüsseln, damit die API ihn
 * mitlesen kann, ohne den ganzen Cron-Job zu importieren.
 *
 * Der Wert ist ein ISO-Zeitstempel. Zeilen aus PR 1 tragen noch ein reines
 * Datum ("2026-09-03"); die Seite zeigt die dann ohne Uhrzeit an.
 */
export const NOTIFICATION_LAST_RUN_KEY = "notification_last_run";

/**
 * Bis zu welcher Stunde eine verpasste Meldung noch nachgeholt wird.
 *
 * Der stündliche Lauf traf die gewählte Stunde vorher exakt oder gar nicht:
 * ein Neustart um 09:05 verschluckte die 09:00-Runde für den ganzen Tag. Ab
 * der gewählten Stunde bleibt das Fenster deshalb offen -- aber nicht bis
 * Mitternacht: eine Erinnerung an Lebensmittel, die um 23:30 eintrudelt, kann
 * niemand mehr gebrauchen.
 */
export const NOTIFICATION_CATCHUP_UNTIL_HOUR = 22;

/**
 * Die wählbaren Stunden.
 *
 * Vorher standen hier drei feste Zeitpunkte, begründet mit dem stündlichen
 * Cron-Job -- der kann aber jede volle Stunde, die Beschränkung war reine
 * Oberfläche. Die Obergrenze ist dieselbe wie die des Nachholfensters: eine
 * Stunde, zu der ohnehin nichts mehr zugestellt würde, darf gar nicht erst
 * wählbar sein. Nach unten sind 6:00 die Grenze, weil eine Push-Meldung über
 * Joghurt niemanden um 4 Uhr wecken soll.
 */
export const NOTIFICATION_HOUR_MIN = 6;
export const NOTIFICATION_HOUR_MAX = NOTIFICATION_CATCHUP_UNTIL_HOUR;

export const LEAD_DAY_OPTIONS = [
  { days: 1, label: "Am Vortag" },
  { days: 2, label: "2 Tage vorher" },
  { days: 3, label: "3 Tage vorher" },
] as const;

export type NotificationSettings = {
  leadDays: number;
  time: string;
  weeklySummary: boolean;
  stages: Record<Stage, boolean>;
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  leadDays: 2,
  time: "09:00",
  weeklySummary: true,
  // Aus der Karte abgeleitet statt daneben noch einmal aufgeschrieben: ein
  // neuer Anlass bringt seine Voreinstellung selbst mit.
  stages: Object.fromEntries(
    STAGES.map((stage) => [stage, NOTIFICATION_STAGES[stage].default]),
  ) as Record<Stage, boolean>,
};

/** Alle Zeilen, die zusammen eine NotificationSettings ergeben. */
export const NOTIFICATION_SETTING_KEYS: string[] = [
  ...Object.values(NOTIFICATION_KEYS),
  ...STAGES.map((stage) => NOTIFICATION_STAGES[stage].key),
];

/** "09:00" -> 9. Für den Abgleich mit der laufenden Stunde im Cron-Job. */
export function notificationHour(time: string): number {
  const hour = Number(time.slice(0, 2));
  return Number.isFinite(hour) ? hour : Number(DEFAULT_NOTIFICATION_SETTINGS.time.slice(0, 2));
}

/** 9 -> "09:00". Die Uhrzeit bleibt als Text gespeichert wie bisher. */
export function formatNotificationHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function isValidNotificationTime(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const hour = Number(value.slice(0, 2));
  return (
    value === formatNotificationHour(hour) &&
    hour >= NOTIFICATION_HOUR_MIN &&
    hour <= NOTIFICATION_HOUR_MAX
  );
}

/**
 * Macht aus den rohen Einstellungs-Zeilen eine vollständige Einstellung.
 *
 * Die Abfrage bleibt beim Aufrufer -- die API liest zusätzlich das Monatsziel,
 * der Cron-Job zusätzlich den Wochen-Merker der jeweiligen Liste. Das
 * Auswerten und die Rückfallwerte standen vorher in beiden Dateien, Zeile für
 * Zeile gleich, und mussten zweimal nachgezogen werden.
 */
export function parseNotificationSettings(byKey: Map<string, string>): NotificationSettings {
  const leadDays = Number(byKey.get(NOTIFICATION_KEYS.leadDays));
  const time = byKey.get(NOTIFICATION_KEYS.time);
  const weekly = byKey.get(NOTIFICATION_KEYS.weeklySummary);

  return {
    leadDays: Number.isFinite(leadDays) ? leadDays : DEFAULT_NOTIFICATION_SETTINGS.leadDays,
    time: isValidNotificationTime(time) ? time : DEFAULT_NOTIFICATION_SETTINGS.time,
    weeklySummary:
      weekly === undefined ? DEFAULT_NOTIFICATION_SETTINGS.weeklySummary : weekly === "1",
    stages: Object.fromEntries(
      STAGES.map((stage) => {
        const raw = byKey.get(NOTIFICATION_STAGES[stage].key);
        return [stage, raw === undefined ? NOTIFICATION_STAGES[stage].default : raw === "1"];
      }),
    ) as Record<Stage, boolean>,
  };
}
