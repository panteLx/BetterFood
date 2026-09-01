import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Die Überschrift über einem Abschnitt der Vorratsliste.
 *
 * Klein, sehr fett, gesperrt und in Großbuchstaben -- absichtlich kein
 * verkleinerter Fließtext. Ein Abschnittsname ist keine Aussage, sondern eine
 * Trennlinie mit Beschriftung, und in dieser Form nimmt er dem Artikelnamen
 * darunter nichts weg: die Zeilen bleiben das Lauteste auf dem Bildschirm,
 * die Gliederung ordnet nur.
 *
 * Der Zähler steht rechts und nicht hinter dem Titel, weil er in jeder Zeile
 * an derselben Kante steht und sich so über alle Abschnitte hinweg
 * vergleichen lässt.
 */
export function SectionLabel({
  title,
  tone = "muted",
  count,
  href,
  linkLabel = "Alle ansehen",
  hint,
}: {
  title: string;
  /** "danger" allein für Abgelaufenes -- sonst verliert die Farbe ihr Gewicht. */
  tone?: "danger" | "muted";
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
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2
        className={cn(
          "pl-1 text-[11px] font-extrabold tracking-[0.09em] uppercase",
          tone === "danger" ? "text-danger" : "text-faint",
        )}
      >
        {title}
        {count !== undefined && (
          <span className="ml-1.5 font-mono tabular-nums">{count}</span>
        )}
      </h2>
      {href ? (
        <Link href={href} className="text-[12.5px] font-bold text-primary">
          {linkLabel}
        </Link>
      ) : (
        hint && <span className="text-[11.5px] font-semibold text-faint">{hint}</span>
      )}
    </div>
  );
}
