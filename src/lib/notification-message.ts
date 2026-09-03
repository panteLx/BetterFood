/**
 * Welche Stufe ein Artikel heute hat und wie die Meldung dazu heißt.
 *
 * Steht getrennt vom Versandweg (expiry-check.ts), weil derselbe Text an drei
 * Stellen entsteht: im stündlichen Lauf, in der Testbenachrichtigung und in
 * der Vorschau auf /settings/erinnerungen. Die Vorschau ist eine
 * Client-Komponente -- deshalb ist diese Datei frei von Datenbankzugriffen und
 * kennt vom Artikel nur, was sie liest: Name und MHD.
 */
import { addDays, daysUntil, startOfDay } from "@/lib/expiry";
import type { Stage } from "@/lib/notification-settings";

// Wie oft sich ein bereits abgelaufener Artikel wieder meldet. Einmal und nie
// wieder wäre genau der Fall, für den die App existiert -- täglich war der
// Zustand vorher und der Grund, warum die Meldungen weggewischt wurden.
export const EXPIRED_REPEAT_DAYS = 7;

// Ab hier wird der Meldungstext abgeschnitten. iOS zeigt ohnehin nur zwei
// Zeilen; eine kommagetrennte Liste aus zwanzig Namen war weder lesbar noch
// als Vorschau brauchbar.
const BODY_NAME_LIMIT = 5;

// Vom Dringlichsten zum Unwichtigsten -- die Reihenfolge, in der die Stufen
// im Titel erscheinen. Nicht die Reihenfolge der Schalter auf der
// Einstellungsseite: die läuft chronologisch (siehe STAGES).
const STAGE_ORDER: Stage[] = ["expired", "zero", "lead"];

/**
 * In welcher Stufe der Artikel heute steckt und wann diese Stufe begonnen hat.
 *
 * Der Beginn lässt sich allein aus dem MHD rechnen, es braucht also keine
 * Stufenspalte in der Datenbank. Das macht die Regel auch selbstheilend: war
 * der Server am Ablauftag aus, ist die Stufe am nächsten Tag immer noch
 * "abgelaufen" und der zugehörige Merker immer noch älter als ihr Beginn --
 * die Meldung kommt verspätet statt gar nicht.
 */
export function stageOf(
  item: { expiryDate: Date },
  leadDays: number,
  today: Date,
): { stage: Stage; start: Date } | null {
  const days = daysUntil(item.expiryDate, today);
  const expiry = startOfDay(item.expiryDate);

  if (days < 0) return { stage: "expired", start: addDays(1, expiry) };
  if (days === 0) return { stage: "zero", start: expiry };
  if (days <= leadDays) return { stage: "lead", start: addDays(-leadDays, expiry) };
  return null;
}

/**
 * Hat dieses Mitglied die aktuelle Stufe schon gehört?
 *
 * Ein einziger Vergleich: liegt der letzte Merker vor dem Beginn der Stufe,
 * ist die Meldung fällig. Abgelaufene Ware kommt zusätzlich wöchentlich
 * wieder -- ein vergessener Artikel darf nicht für immer verstummen.
 */
export function isDue(
  stage: Stage,
  start: Date,
  notifiedAt: Date | undefined,
  today: Date,
): boolean {
  if (!notifiedAt) return true;
  if (notifiedAt < start) return true;
  return stage === "expired" && daysUntil(notifiedAt, today) <= -EXPIRED_REPEAT_DAYS;
}

function singleTitle(name: string, stage: Stage): string {
  if (stage === "expired") return `${name} ist abgelaufen`;
  if (stage === "zero") return `${name} läuft heute ab`;
  return `${name} läuft bald ab`;
}

function soleStageTitle(stage: Stage, count: number): string {
  if (stage === "expired") return `${count} Lebensmittel sind abgelaufen`;
  if (stage === "zero") return `${count} Lebensmittel laufen heute ab`;
  return `${count} Lebensmittel laufen bald ab`;
}

function stagePhrase(stage: Stage, count: number): string {
  if (stage === "expired") return `${count} abgelaufen`;
  if (stage === "zero") return count === 1 ? "1 läuft heute ab" : `${count} laufen heute ab`;
  return count === 1 ? "1 läuft bald ab" : `${count} laufen bald ab`;
}

/**
 * Der Titel benennt jede vertretene Stufe mit ihrer Zahl.
 *
 * Vorher entschied allein der dringlichste Artikel über den Satz und die
 * Gesamtzahl füllte ihn auf: ein abgelaufener Joghurt neben zwei heute
 * fälligen ergab "3 Lebensmittel sind abgelaufen" -- eine Aussage, die für
 * zwei von drei Artikeln schlicht falsch war.
 */
export function notificationTitle(due: readonly { item: { name: string }; stage: Stage }[]): string {
  if (due.length === 1) return singleTitle(due[0].item.name, due[0].stage);

  const present = STAGE_ORDER.map((stage) => ({
    stage,
    count: due.filter((entry) => entry.stage === stage).length,
  })).filter((entry) => entry.count > 0);

  if (present.length === 1) return soleStageTitle(present[0].stage, present[0].count);
  return present.map((entry) => stagePhrase(entry.stage, entry.count)).join(", ");
}

/** Die Namen, gekappt -- der Rest wird gezählt statt aufgezählt. */
export function notificationBody(names: readonly string[]): string {
  if (names.length <= BODY_NAME_LIMIT) return names.join(", ");
  const rest = names.length - BODY_NAME_LIMIT;
  const suffix = rest === 1 ? "+ 1 weiteres" : `+ ${rest} weitere`;
  return `${names.slice(0, BODY_NAME_LIMIT).join(", ")} ${suffix}`;
}
