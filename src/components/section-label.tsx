import Link from "next/link";
import { STATUS_CLASSES, type StatusFilter } from "@/lib/expiry";
import { cn } from "@/lib/utils";

/**
 * Die Farbrolle je Abschnitt -- eine von drei, nicht "gefährlich oder
 * neutral" wie bisher: "Schon drüber" trägt die Gefahrfarbe, "Heute
 * dran"/"Morgen" die Warnfarbe, "Diese Woche"/"Später" (und Abschnitte ohne
 * Ablauf-Bezug, etwa Gruppierung nach Ort oder Kategorie) die Primärfarbe.
 * Aufrufer aus `EXPIRY_BUCKETS` leiten das mit `toneForFilter` aus dem
 * vorhandenen `filter`-Feld ab: "abgelaufen" -> danger, "bald" -> warning,
 * `null` -> primary -- exakt die drei Gruppen der Tabelle im Handoff.
 */
export type SectionTone = "danger" | "warning" | "primary";

/**
 * Die Ableitung aus dem `filter`-Feld eines Eimers -- an einer Stelle, weil
 * Startseite und Vorrat sie beide brauchen und eine zweite Abschrift lautlos
 * auseinanderlaufen würde.
 */
export function toneForFilter(filter: StatusFilter | null): SectionTone {
  return filter === "abgelaufen" ? "danger" : filter === "bald" ? "warning" : "primary";
}

/*
 * Der Zaehler ist die Statuspille aus STATUS_CLASSES (expiry.ts) und keine
 * zweite Tabelle derselben Toenungen -- eine Palettenaenderung landet damit
 * an einer Stelle. Nur die Ueberschrift hat keine Entsprechung dort: sie
 * faerbt sich einzig bei "danger", weil "Schon drueber" der einzige
 * Abschnitt ist, der von sich aus laut sein darf.
 */
const TONE_CLASSES: Record<SectionTone, { heading: string; counter: string }> = {
  danger: { heading: "text-danger-ink", counter: STATUS_CLASSES.expired.chip },
  warning: { heading: "text-foreground", counter: STATUS_CLASSES.soon.chip },
  primary: { heading: "text-foreground", counter: STATUS_CLASSES.fresh.chip },
};

/**
 * Die Überschrift über einem Abschnitt der Vorratsliste.
 *
 * Bis zum Frischling-Umbau eine kleine, gesperrte Versalzeile -- jetzt eine
 * richtige Überschrift (Quicksand 19px/700) mit einem farbigen Zähler
 * daneben. Ein Abschnittsname ist trotzdem keine Aussage, sondern eine
 * Trennlinie mit Beschriftung: die Zeilen darunter bleiben das Lauteste auf
 * dem Bildschirm, die Gliederung ordnet nur.
 *
 * Der Zähler steht als eigene Pille rechts neben dem Titel und nicht mehr
 * inline in ihm, weil er damit in jedem Abschnitt an derselben Kante beginnt
 * und sich so über alle Abschnitte hinweg vergleichen lässt.
 *
 * WICHTIG für Aufrufer, die aus `EXPIRY_BUCKETS` (src/lib/expiry.ts) lesen:
 * `title` hier ist reiner Anzeigetext. Der Eimer-Eintrag trägt zwei Felder,
 * `title` (Gruppierungs- und Link-Schlüssel) und `label` (was der Nutzer
 * liest, z. B. "Schon drüber" statt "Abgelaufen") -- hierher gehört immer
 * `bucket.label`, nie `bucket.title`. Eine Textänderung an `title` böge sonst
 * lautlos die Gruppierung und die Links auf den gefilterten Vorrat um.
 */
export function SectionLabel({
  title,
  tone = "primary",
  count,
  href,
  linkLabel = "alle ansehen",
  hint,
}: {
  /** Anzeigetext -- bei den Ablauf-Eimern `bucket.label`, nie `bucket.title`. */
  title: string;
  tone?: SectionTone;
  /** Anzahl rechts. Weggelassen, wo die Zahl schon woanders steht. */
  count?: number;
  /** Ziel des Links rechts; ohne href steht dort nur der Zähler. */
  href?: string;
  linkLabel?: string;
  /**
   * Ein Hinweis statt eines Links rechts -- für Abschnitte, deren Zeilen
   * selbst die Aktion sind ("Fertig · antippen zum Ändern"). Ein Link daneben
   * wäre dort ein zweites Ziel für dieselbe Geste.
   */
  hint?: string;
}) {
  const classes = TONE_CLASSES[tone];

  return (
    <div className="flex items-center gap-2.5">
      <h2 className={cn("font-heading text-[19px] leading-none font-bold", classes.heading)}>
        {title}
      </h2>
      {count !== undefined && (
        <span
          className={cn(
            "inline-flex h-[23px] min-w-[23px] items-center justify-center rounded-full px-2 font-mono text-[11.5px] font-bold tabular-nums",
            classes.counter,
          )}
        >
          {count}
        </span>
      )}
      <span className="flex-1" />
      {href ? (
        <Link href={href} className="font-heading text-[13px] font-bold text-primary-deep">
          {linkLabel}
        </Link>
      ) : (
        hint && <span className="text-[11.5px] font-semibold text-faint">{hint}</span>
      )}
    </div>
  );
}
