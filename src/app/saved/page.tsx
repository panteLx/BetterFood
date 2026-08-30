import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { formatMedium, fromDateInputValue } from "@/lib/expiry";
import { ENTRY_METHODS, parseEntryMethod } from "@/lib/entry-method";

export const metadata: Metadata = {
  title: "Gespeichert",
};

type SavedParams = Promise<{
  name?: string;
  date?: string;
  method?: string;
  merged?: string;
}>;

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
    <Suspense fallback={<div className="flex-1" />}>
      <Saved searchParams={searchParams} />
    </Suspense>
  );
}

async function Saved({ searchParams }: { searchParams: SavedParams }) {
  const { name, date, method, merged } = await searchParams;

  const expiry = date ? fromDateInputValue(date) : null;
  const next = ENTRY_METHODS[parseEntryMethod(method)];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5.5 px-7 py-10">
      <span className="flex size-26 animate-pop items-center justify-center rounded-[34px] bg-primary text-primary-foreground">
        <Check className="size-13" strokeWidth={2.2} />
      </span>

      <div className="animate-rise text-center">
        <h1 className="text-2xl leading-snug">Gespeichert</h1>
        <p className="mt-2 text-[15px] leading-relaxed font-medium text-balance text-muted-foreground">
          {name ?? "Artikel"}
          {expiry && ` · haltbar bis ${formatMedium(expiry)}`}
          {merged && ` · jetzt ${merged}× im Vorrat`}
        </p>
      </div>

      <div className="mt-3 flex w-full animate-rise flex-col gap-2.5">
        {/* Derselbe Weg wie eben, nicht irgendeiner: nach dem Einkauf haengt
            der naechste Artikel meist am selben Verfahren. */}
        <Link
          href={next.href}
          className="flex h-13.5 items-center justify-center rounded-2xl border border-border bg-card text-center text-[15px] font-bold text-balance"
        >
          {next.nextLabel}
        </Link>
        <Link
          href="/"
          className="flex h-13.5 items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground"
        >
          Fertig
        </Link>
      </div>
    </div>
  );
}
