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
import { STAGES, type NotificationSettings, type Stage } from "@/lib/notification-settings";

// Wie oft sich ein bereits abgelaufener Artikel wieder meldet. Einmal und nie
// wieder wäre genau der Fall, für den die App existiert -- täglich war der
// Zustand vorher und der Grund, warum die Meldungen weggewischt wurden.
const EXPIRED_REPEAT_DAYS = 7;

/**
 * Wie weit die Wochenübersicht schaut. "Sonntags, was diese Woche fällig
 * ist" soll wörtlich stimmen: vorher zählte sie alles mit, was überhaupt
 * unter der Schwelle lag -- inklusive der Ware, die seit Monaten abgelaufen
 * im Kühlschrank stand.
 */
export const DIGEST_WINDOW_DAYS = 7;

// Ab hier wird der Meldungstext abgeschnitten. iOS zeigt ohnehin nur zwei
// Zeilen; eine kommagetrennte Liste aus zwanzig Namen war weder lesbar noch
// als Vorschau brauchbar.
const BODY_NAME_LIMIT = 5;

// Vom Dringlichsten zum Unwichtigsten -- die Reihenfolge, in der die Stufen
// im Titel erscheinen. Genau die Gegenrichtung von STAGES (chronologisch, die
// Reihenfolge der Schalter auf der Einstellungsseite), deshalb abgeleitet und
// nicht daneben noch einmal aufgeschrieben: eine vierte Stufe wäre sonst an
// zwei Stellen einzusortieren.
const STAGE_ORDER: Stage[] = [...STAGES].reverse();

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
function isDue(
  stage: Stage,
  start: Date,
  notifiedAt: Date | undefined,
  today: Date,
): boolean {
  if (!notifiedAt) return true;
  if (notifiedAt < start) return true;
  return stage === "expired" && daysUntil(notifiedAt, today) <= -EXPIRED_REPEAT_DAYS;
}

/**
 * Die Stufe, mit der sich dieser Artikel bei diesem Mitglied jetzt melden
 * würde -- oder null, wenn er stumm bleibt.
 *
 * Fasst die drei Bedingungen zusammen, die vorher im stündlichen Lauf
 * nebeneinander standen: in welcher Stufe der Artikel steckt, ob das Mitglied
 * diese Stufe überhaupt hören will, und ob es sie nicht schon gehört hat. Als
 * eine Funktion, weil "würde das jetzt melden?" sonst an jeder Stelle neu
 * zusammengesetzt wird, die die Frage beantworten muss -- und die Vorschau auf
 * der Einstellungsseite ist eine davon.
 *
 * Eine abgeschaltete Stufe bekommt keinen Merker und meldet sich damit in
 * ihrer nächsten Stufe ganz normal wieder. Wer nur die Vorwarnung abbestellt,
 * hört am Ablauftag trotzdem davon.
 */
export function dueStage(
  item: { expiryDate: Date },
  settings: NotificationSettings,
  notifiedAt: Date | undefined,
  today: Date,
): Stage | null {
  const current = stageOf(item, settings.leadDays, today);
  if (!current || !settings.stages[current.stage]) return null;
  return isDue(current.stage, current.start, notifiedAt, today) ? current.stage : null;
}

/**
 * Wie viele Tage voraus dieses Mitglied überhaupt etwas hören will.
 *
 * Steht neben dueStage(), weil die Abfrage des stündlichen Laufs und der
 * Filter darauf dieselbe Antwort brauchen: fragt das Fenster weniger ab, als
 * der Filter durchließe, verstummen Meldungen ohne eine einzige
 * Fehlermeldung. Wer die Vorwarnung abgeschaltet hat, schaut gar nicht voraus
 * -- seine eingestellte Vorwarnzeit bleibt gespeichert, zählt hier aber nicht
 * mit. Nach unten ist das Fenster ohnehin offen: abgelaufene Ware meldet sich
 * weiter, nur eben wöchentlich statt täglich.
 */
export function lookaheadDays(settings: NotificationSettings, isSunday: boolean): number {
  const lead = settings.stages.lead ? settings.leadDays : 0;
  return isSunday && settings.weeklySummary ? Math.max(lead, DIGEST_WINDOW_DAYS) : lead;
}

/**
 * Hört dieses Mitglied heute überhaupt auf irgendetwas?
 *
 * Alle Stufen abzuschalten ist erlaubt, und wer das tut, soll den stündlichen
 * Lauf nichts kosten: ohne diese Frage lief die Stufenprüfung über jeden
 * Kandidaten der Liste, um das Ergebnis anschließend wegzuwerfen.
 */
export function wantsAnything(settings: NotificationSettings, isSunday: boolean): boolean {
  return STAGES.some((stage) => settings.stages[stage]) || (isSunday && settings.weeklySummary);
}

/**
 * Die Formulierungen je Stufe: ein Artikel allein, mehrere derselben Stufe,
 * die Teilaussage in einem gemischten Titel, und das Präfix vor der
 * Namensgruppe im Meldungstext.
 *
 * Als Tabelle und nicht als drei Funktionen mit je einer if-Kette: die Ketten
 * fielen am Ende auf die Vorwarnung durch, eine vierte Stufe hätte also
 * stillschweigend "läuft bald ab" gesagt. Record<Stage, ...> macht daraus
 * einen Typfehler.
 *
 * Das Präfix ist absichtlich kürzer als die Titel-Formulierung ("Heute" statt
 * "laufen heute ab"): der Titel sagt den Sachverhalt, der Text darunter
 * sortiert nur noch Namen ein und hat für jede Gruppe zwei Wörter Platz.
 *
 * Das Emoji nimmt der Meldung die Strenge -- eine Push-Nachricht über Joghurt
 * darf nach etwas aussehen und nicht nach einem Systemalarm. Es trägt
 * zusätzlich die Dringlichkeit, die man am Symbol schneller sieht als am
 * Satz. Bewusst alte Zeichen (Unicode 6.0, 2010) statt der ausdrucksstärkeren
 * neuen wie 🫠: die rendern auf älteren Android-Versionen als leeres Kästchen,
 * und ein Kästchen ist das Gegenteil von verspielt.
 */
const STAGE_TEXT: Record<
  Stage,
  {
    single: (name: string) => string;
    sole: (count: number) => string;
    phrase: (count: number) => string;
    prefix: string;
    emoji: string;
  }
> = {
  lead: {
    single: (name) => `${name} läuft bald ab`,
    sole: (count) => `${count} Lebensmittel laufen bald ab`,
    phrase: (count) => (count === 1 ? "1 läuft bald ab" : `${count} laufen bald ab`),
    prefix: "Bald",
    emoji: "🌱",
  },
  zero: {
    single: (name) => `${name} läuft heute ab`,
    sole: (count) => `${count} Lebensmittel laufen heute ab`,
    phrase: (count) => (count === 1 ? "1 läuft heute ab" : `${count} laufen heute ab`),
    prefix: "Heute",
    emoji: "⏰",
  },
  expired: {
    single: (name) => `${name} ist abgelaufen`,
    sole: (count) => `${count} Lebensmittel sind abgelaufen`,
    phrase: (count) => `${count} abgelaufen`,
    prefix: "Abgelaufen",
    emoji: "😵",
  },
};

/**
 * Der Titel benennt jede vertretene Stufe mit ihrer Zahl, angeführt vom Emoji
 * der dringendsten.
 *
 * Vorher entschied allein der dringlichste Artikel über den Satz und die
 * Gesamtzahl füllte ihn auf: ein abgelaufener Joghurt neben zwei heute
 * fälligen ergab "3 Lebensmittel sind abgelaufen" -- eine Aussage, die für
 * zwei von drei Artikeln schlicht falsch war.
 *
 * Genau ein Emoji, und zwar vorn: Android kürzt lange Titel am Ende, iOS
 * ebenso -- ein Symbol hinter dem Satz wäre das erste, was verschwindet.
 */
export function notificationTitle(due: readonly { item: { name: string }; stage: Stage }[]): string {
  if (due.length === 1) {
    const { stage, item } = due[0];
    return `${STAGE_TEXT[stage].emoji} ${STAGE_TEXT[stage].single(item.name)}`;
  }

  const present = STAGE_ORDER.map((stage) => ({
    stage,
    count: due.filter((entry) => entry.stage === stage).length,
  })).filter((entry) => entry.count > 0);

  // STAGE_ORDER ist absteigend dringend, present behält diese Reihenfolge --
  // der erste Eintrag ist damit die dringendste vertretene Stufe.
  const emoji = STAGE_TEXT[present[0].stage].emoji;
  const sentence =
    present.length === 1
      ? STAGE_TEXT[present[0].stage].sole(present[0].count)
      : present.map((entry) => STAGE_TEXT[entry.stage].phrase(entry.count)).join(", ");

  return `${emoji} ${sentence}`;
}

/** Was nicht mehr in den Text passte, wird gezählt statt aufgezählt. */
function restSuffix(rest: number): string {
  return rest === 1 ? "+ 1 weiteres" : `+ ${rest} weitere`;
}

/**
 * Der Meldungstext: die Namen, nach Stufe gruppiert und je Gruppe benannt.
 *
 * Vorher war das eine flache, nach MHD sortierte Namensliste -- und damit die
 * eine Frage unbeantwortet, die der Titel aufwirft: "1 abgelaufen, 2 laufen
 * heute ab" plus "Naturjoghurt, Vollmilch, Hackfleisch" lässt die Zuordnung
 * allein an der Reihenfolge hängen, und die sieht niemand. Mit Präfix steht
 * sie da: "😵 Abgelaufen: Naturjoghurt · ⏰ Heute: Vollmilch, Hackfleisch".
 *
 * Das Emoji des Titels wiederholt sich hier bei der dringendsten Gruppe. Das
 * ist Absicht: es markiert Gruppen, und eine Gruppe ohne Symbol neben zwei mit
 * sähe wie ein Fehler aus.
 *
 * Einzeilig mit Mittelpunkt statt mehrzeilig: Zeilenumbrüche im body zeigt
 * iOS in der eingeklappten Meldung nicht, dort bliebe die zweite Gruppe
 * unsichtbar.
 *
 * Ein einzelner Artikel bleibt ohne Präfix -- bei ihm nennt der Titel Name
 * und Stufe schon in einem Satz ("Naturjoghurt ist abgelaufen").
 */
export function notificationBody(
  due: readonly { item: { name: string }; stage: Stage }[],
): string {
  if (due.length === 1) return due[0].item.name;

  // Das Namensbudget wandert von der dringendsten Gruppe nach unten: läuft es
  // aus, fehlt am Ende die Vorwarnung und nicht die abgelaufene Ware. Eine
  // Gruppe, für die kein Platz mehr ist, verschwindet ganz statt als leeres
  // "Bald: " dazustehen; ihre Namen zählt der Rest mit.
  let budget = BODY_NAME_LIMIT;
  let hidden = 0;
  const groups: string[] = [];

  for (const stage of STAGE_ORDER) {
    const names = due.filter((entry) => entry.stage === stage).map((entry) => entry.item.name);
    if (names.length === 0) continue;

    const shown = names.slice(0, budget);
    budget -= shown.length;
    hidden += names.length - shown.length;
    if (shown.length > 0) {
      const { emoji, prefix } = STAGE_TEXT[stage];
      groups.push(`${emoji} ${prefix}: ${shown.join(", ")}`);
    }
  }

  const body = groups.join(" · ");
  return hidden === 0 ? body : `${body} · ${restSuffix(hidden)}`;
}

/**
 * Der Titel der Wochenübersicht. Der Kalender statt eines Stufen-Emojis: die
 * Übersicht ist Planung, keine Rettung, und soll auf dem Sperrbildschirm auch
 * nicht so aussehen.
 *
 * Steht hier und nicht als Zeichenkette im Versandweg, weil jeder andere
 * Meldungstext der App auch hier steht -- sonst ist der eine, der es nicht
 * tut, der eine, der beim nächsten Mal vergessen wird.
 */
export function digestTitle(count: number): string {
  return `📅 Diese Woche: ${count} Lebensmittel laufen ab`;
}

/**
 * Der Text der Wochenübersicht: eine flache Namensliste, gekappt.
 *
 * Ohne Stufen, weil dort keine gilt -- die Übersicht zeigt das Fenster der
 * kommenden sieben Tage, in dem fast alles noch in der Vorwarnung steckt.
 * Eine Gruppierung nach Tag ("Heute / Morgen / Diese Woche") wäre hier die
 * passende Achse; bis dahin bleibt es bei der Aufzählung nach MHD.
 */
export function digestBody(names: readonly string[]): string {
  if (names.length <= BODY_NAME_LIMIT) return names.join(", ");
  const rest = names.length - BODY_NAME_LIMIT;
  return `${names.slice(0, BODY_NAME_LIMIT).join(", ")} ${restSuffix(rest)}`;
}
