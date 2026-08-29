import Link from "next/link";
import { Check } from "lucide-react";
import { formatMedium, fromDateInputValue } from "@/lib/expiry";

/**
 * Der Abschluss nach dem Erfassen.
 *
 * Vorher endete das Speichern in einer Meldung, die nach vier Sekunden weg
 * war -- und der naechste Artikel kostete erneut Navigationsleiste,
 * Auswahl-Blatt und einen kompletten Kamerastart. Nach dem Einkauf ist genau
 * dieser naechste Artikel aber der Normalfall, deshalb steht er hier als
 * eigener Knopf.
 */
export default async function SavedPage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string; date?: string; method?: string; merged?: string }>;
}) {
  const { name, date, method, merged } = await searchParams;

  const expiry = date ? fromDateInputValue(date) : null;
  const scanned = method === "scan";

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
        <Link
          href={scanned ? "/scan" : "/add"}
          className="flex h-13.5 items-center justify-center rounded-2xl border border-border bg-card text-[15px] font-bold"
        >
          {scanned ? "Nächsten Barcode scannen" : "Noch etwas eintragen"}
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
