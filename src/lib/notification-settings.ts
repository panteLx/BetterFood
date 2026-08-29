/**
 * Die persoenlichen Erinnerungs-Einstellungen: wie früh, zu welcher Uhrzeit,
 * und ob sonntags eine Wochenübersicht kommt.
 *
 * Schluessel und Standardwerte stehen hier zusammen, weil sie an drei Stellen
 * gebraucht werden -- in der API, in der Einstellungsseite und im Cron-Job.
 * Der Schluessel notification_lead_days ist absichtlich unveraendert
 * geblieben: bestehende Zeilen sollen ihre Bedeutung behalten.
 */
export const NOTIFICATION_KEYS = {
  leadDays: "notification_lead_days",
  time: "notification_time",
  weeklySummary: "notification_weekly_summary",
} as const;

/**
 * Feste Auswahl statt freier Uhrzeit: der Cron-Job laeuft stuendlich, eine
 * Minutengenauigkeit koennte er gar nicht einhalten -- und drei Zeitpunkte
 * (vor der Arbeit, am Vormittag, vor dem Abendessen) decken ab, wann jemand
 * ueberhaupt etwas mit der Meldung anfangen kann.
 */
export const NOTIFICATION_TIMES = ["08:00", "09:00", "18:00"] as const;
export type NotificationTime = (typeof NOTIFICATION_TIMES)[number];

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

/** "09:00" -> 9. Fuer den Abgleich mit der laufenden Stunde im Cron-Job. */
export function notificationHour(time: string): number {
  const hour = Number(time.slice(0, 2));
  return Number.isFinite(hour) ? hour : 9;
}
