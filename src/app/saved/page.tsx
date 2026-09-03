import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Avo } from "@/components/avo";
import { formatMedium, fromDateInputValue } from "@/lib/expiry";
import { ENTRY_METHODS, parseEntryMethod } from "@/lib/entry-method";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Gespeichert",
};

type SavedParams = Promise<{
  name?: string;
  date?: string;
  method?: string;
  merged?: string;
  /**
   * Noch von keinem Aufrufer gesetzt (item-form.tsx traegt ihn nicht mit) --
   * die Seite ist hier nur vorbereitet, falls das in einer anderen Einheit
   * nachgezogen wird. Ohne den Parameter faellt der Satz auf "im Vorrat"
   * zurueck.
   */
  place?: string;
}>;

/**
 * Fuenf Konfetti-Teile, genau wie im Entwurf (frischling-avo.dc.html, Screen
 * 8): vier Rechtecke in den Zustandsfarben und ein Punkt in --primary-light,
 * dem hellen Anteil des Verlaufs. --dx/--dr liest bf-confetti pro Teil aus
 * dem Inline-Style -- nur so faellt jedes Teil auf einem eigenen Weg.
 */
const CONFETTI: {
  top: number;
  left: number;
  size: number;
  radius: string;
  color: string;
  dx: string;
  dr: string;
  duration: string;
  delay: string;
}[] = [
  { top: 150, left: 58, size: 11, radius: "4px", color: "bg-primary", dx: "-32px", dr: "480deg", duration: "2.5s", delay: "0.05s" },
  { top: 150, left: 128, size: 11, radius: "4px", color: "bg-warning", dx: "24px", dr: "-520deg", duration: "2.8s", delay: "0.3s" },
  { top: 150, left: 208, size: 11, radius: "4px", color: "bg-danger", dx: "-16px", dr: "600deg", duration: "2.3s", delay: "0.55s" },
  { top: 150, left: 288, size: 11, radius: "4px", color: "bg-badge", dx: "38px", dr: "-440deg", duration: "3s", delay: "0.18s" },
  { top: 150, left: 170, size: 10, radius: "999px", color: "bg-primary-light", dx: "54px", dr: "400deg", duration: "2.6s", delay: "0.45s" },
];

/**
 * Der Abschluss nach dem Erfassen.
 *
 * Vorher endete das Speichern in einer Meldung, die nach vier Sekunden weg
 * war -- und der naechste Artikel kostete erneut Navigationsleiste,
 * Auswahl-Blatt und einen kompletten Kamerastart. Nach dem Einkauf ist genau
 * dieser naechste Artikel aber der Normalfall, deshalb steht er hier als
 * eigener Knopf.
 *
 * "await searchParams" muss unterhalb einer <Suspense>-Grenze passieren, sonst
 * blockiert die Navigation komplett den Server-Render (Next 16 "Instant
 * Navigation"-Validierung, siehe node_modules/next/dist/docs/.../
 * instant-navigation.md, Abschnitt "Fixing a navigation that blocks").
 */
export default function SavedPage({
  searchParams,
}: {
  searchParams: SavedParams;
}) {
  return (
    <Suspense fallback={<div className="flex-1 bg-primary-tint" />}>
      <Saved searchParams={searchParams} />
    </Suspense>
  );
}

async function Saved({ searchParams }: { searchParams: SavedParams }) {
  const { name, date, method, merged, place } = await searchParams;

  const expiry = date ? fromDateInputValue(date) : null;
  const next = ENTRY_METHODS[parseEntryMethod(method)];
  const itemName = name ?? "Artikel";
  const quantity = merged ?? "1";

  return (
    // -mt-[...] hebt die Seite ueber die Safe-Area-Polsterung des Layouts
    // hinaus, pt-[...] holt sie innen wieder herein -- derselbe Kniff wie auf
    // /scan: nur so reicht die getoente Flaeche bis unter die Statusleiste.
    <div className="relative -mt-[max(env(safe-area-inset-top),1.75rem)] flex flex-1 flex-col items-center justify-center gap-5.5 overflow-hidden bg-primary-tint px-6.5 pt-[max(env(safe-area-inset-top),1.75rem)] pb-8 text-center">
      {/* Zwei Kreise als Dekoration -- im Entwurf ein eigener Hex-Ton
          (#c1eed3), hier als --primary bei niedriger Deckkraft: dieselbe
          Wirkung, aber ohne einen Wert, der im Dunkelmodus stehen bliebe. */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-[70px] -left-[50px] size-[220px] rounded-full bg-primary/10"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-[60px] -bottom-[90px] size-[250px] rounded-full bg-primary/8"
      />

      {CONFETTI.map((piece, i) => (
        <span
          key={i}
          aria-hidden
          className={cn("pointer-events-none absolute animate-confetti", piece.color)}
          style={
            {
              top: piece.top,
              left: piece.left,
              width: piece.size,
              height: piece.size,
              borderRadius: piece.radius,
              animationDuration: piece.duration,
              animationDelay: piece.delay,
              "--dx": piece.dx,
              "--dr": piece.dr,
            } as React.CSSProperties
          }
        />
      ))}

      <div className="relative flex items-center justify-center">
        {/* bg-card statt eines harten Weiss: im Hellmodus ist --card ohnehin
            #ffffff, im Dunkeln wird daraus die ruhige Kartenfarbe statt eines
            grellen weissen Blitzes. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto size-[190px] animate-burst rounded-full bg-card opacity-50"
        />
        <Avo size="lg" mood="cheer" animation="pop" />
      </div>

      <div className="relative animate-slide-in text-center [animation-delay:120ms]">
        <h1 className="font-heading text-[32px] leading-[1.15] font-bold tracking-[-0.01em]">
          Gespeichert!
        </h1>
        <p className="mt-2.25 text-[15px] leading-relaxed font-semibold text-primary-deep">
          {expiry ? `${itemName} liegt jetzt ${place ?? "im Vorrat"}.` : itemName}
        </p>
      </div>

      {expiry && (
        <div className="relative w-full animate-slide-in rounded-[26px] bg-card px-[18px] py-1.5 shadow-card [animation-delay:220ms]">
          <div className="flex items-center gap-2.5 border-b border-hairline py-[13px]">
            <span className="flex-1 text-[13.5px] font-semibold text-muted-foreground">
              Haltbar bis
            </span>
            <span className="font-heading text-[14.5px] font-bold">{formatMedium(expiry)}</span>
          </div>
          <div className="flex items-center gap-2.5 py-[13px]">
            <span className="flex-1 text-[13.5px] font-semibold text-muted-foreground">
              Im Vorrat
            </span>
            <span className="inline-flex h-[26px] items-center rounded-full bg-primary-tint px-[11px] font-heading text-sm font-bold text-primary-deep">
              jetzt {quantity}×
            </span>
          </div>
        </div>
      )}

      <div className="relative mt-1 flex w-full animate-slide-in flex-col gap-2.5 [animation-delay:320ms]">
        {/* Derselbe Weg wie eben, nicht irgendeiner: nach dem Einkauf haengt
            der naechste Artikel meist am selben Verfahren -- deshalb jetzt die
            gefuellte Hauptaktion, "Fertig" tritt zurueck. */}
        <Link
          href={next.href}
          className="flex h-14.5 items-center justify-center rounded-[22px] bg-(image:--gradient-primary) text-center text-[16.5px] font-bold text-balance text-primary-foreground shadow-cta"
        >
          {next.nextLabel}
        </Link>
        <Link
          href="/"
          className="flex h-13.5 items-center justify-center rounded-[22px] bg-card text-base font-bold text-foreground shadow-row"
        >
          Fertig
        </Link>
      </div>
    </div>
  );
}
