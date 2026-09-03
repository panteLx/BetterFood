/**
 * Die persönlichen Erinnerungs-Einstellungen: wie früh, zu welcher Uhrzeit,
 * und ob sonntags eine Wochenübersicht kommt.
 *
 * Schlüssel und Standardwerte stehen hier zusammen, weil sie an drei Stellen
 * gebraucht werden -- in der API, in der Einstellungsseite und im Cron-Job.
 * Der Schlüssel notification_lead_days ist absichtlich unverändert
 * geblieben: bestehende Zeilen sollen ihre Bedeutung behalten.
 */
export const NOTIFICATION_KEYS = {
  leadDays: "notification_lead_days",
  time: "notification_time",
  weeklySummary: "notification_weekly_summary",
} as const;

/**
 * Feste Auswahl statt freier Uhrzeit: der Cron-Job läuft stündlich, eine
 * Minutengenauigkeit könnte er gar nicht einhalten -- und drei Zeitpunkte
 * (vor der Arbeit, am Vormittag, vor dem Abendessen) decken ab, wann jemand
 * überhaupt etwas mit der Meldung anfangen kann.
 */
export const NOTIFICATION_TIMES = ["08:00", "09:00", "18:00"] as const;
export type NotificationTime = (typeof NOTIFICATION_TIMES)[number];

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

export const LEAD_DAY_OPTIONS = [
  { days: 1, label: "Am Vortag" },
  { days: 2, label: "2 Tage vorher" },
  { days: 3, label: "3 Tage vorher" },
] as const;

export const DEFAULT_NOTIFICATION_SETTINGS = {
  leadDays: 2,
  time: "09:00" as NotificationTime,
  weeklySummary: true,
};

export type NotificationSettings = typeof DEFAULT_NOTIFICATION_SETTINGS;

/** "09:00" -> 9. Für den Abgleich mit der laufenden Stunde im Cron-Job. */
export function notificationHour(time: string): number {
  const hour = Number(time.slice(0, 2));
  return Number.isFinite(hour) ? hour : 9;
}
