"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Barcode } from "lucide-react";
import { Button } from "@/components/ui/button";

// Eigenstaendiger Flow fuer die manuelle EAN-Eingabe, getrennt von der
// Kamera-Scan-Seite (/scan): dort lief die Kamera weiter im Hintergrund,
// obwohl der Nutzer explizit KEINEN Kamera-Scan wollte. Wird sowohl als
// Vollseite (/scan-ean) als auch als Modal (@modal/(.)scan-ean) verwendet.
export function EanEntryPage() {
  const router = useRouter();
  const [barcode, setBarcode] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = barcode.trim();
    if (!trimmed) return;
    // Vor dem Navigieren zuruecksetzen: Cache Components versteckt die
    // verlassene Route via <Activity> statt sie zu unmounten, der State
    // ueberlebt also (siehe node_modules/next/dist/docs/01-app/02-guides/
    // preserving-ui-state.md, "Resetting form state on submit") - sonst
    // steht beim naechsten Oeffnen noch die zuletzt gesuchte EAN im Feld.
    setBarcode("");
    // via=ean, damit der Abschluss-Screen danach wieder die
    // EAN-Eingabe anbietet und nicht die Kamera, die der Nutzer
    // hier gerade bewusst umgangen hat.
    router.push(`/confirm?barcode=${encodeURIComponent(trimmed)}&via=ean`);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-1 flex-col gap-4.5 px-5 pt-2 pb-6"
    >
      <div className="flex items-center gap-2.5">
        <Button
          variant="ghost"
          size="icon-touch"
          aria-label="Zurück"
          onClick={() => router.back()}
          className="-ml-2 rounded-2xl"
        >
          <ArrowLeft className="size-5.5" />
        </Button>
        <h1 className="text-xl leading-tight">EAN eingeben</h1>
      </div>

      <p className="text-[13.5px] leading-relaxed font-medium text-balance text-muted-foreground">
        Wenn die Kamera den Code nicht liest: die Ziffernfolge unter dem Barcode
        eintippen.
      </p>

      <label className="flex h-14 items-center gap-3 rounded-[22px] bg-card px-4 shadow-row">
        <Barcode className="size-5.5 shrink-0 text-faint" strokeWidth={1.7} />
        <input
          inputMode="numeric"
          autoFocus
          placeholder="4104420026094"
          value={barcode}
          onChange={(event) => setBarcode(event.target.value)}
          className="min-w-0 flex-1 bg-transparent font-mono text-lg font-semibold outline-none placeholder:text-faint"
        />
      </label>

      <Button
        type="submit"
        disabled={!barcode.trim()}
        className="h-14 rounded-lg text-base"
      >
        Weiter
      </Button>

      {/* Rueckweg zur Kamera und Ausweg nach unten: die Erfassungsseiten
          laufen ohne Navigationsleiste, und ohne Barcode waere die Seite
          sonst eine Sackgasse. */}
      <div className="flex flex-col items-center gap-1 pt-1">
        <Link href="/scan" className="p-2 text-sm font-semibold text-primary">
          Stattdessen Barcode scannen
        </Link>
        <Link
          href="/add"
          className="p-2 text-sm font-semibold text-muted-foreground"
        >
          Kein Barcode vorhanden
        </Link>
      </div>
    </form>
  );
}
