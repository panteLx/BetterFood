"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Eigenstaendiger Flow fuer die manuelle EAN-Eingabe, getrennt von der
// Kamera-Scan-Seite (/scan): dort lief die Kamera weiter im Hintergrund,
// obwohl der Nutzer explizit KEINEN Kamera-Scan wollte. Wird sowohl als
// Vollseite (/scan-ean) als auch als Modal (@modal/(.)scan-ean) verwendet.
export function EanEntryPage() {
  const router = useRouter();
  const [barcode, setBarcode] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = barcode.trim();
    if (!trimmed) return;
    // Vor dem Navigieren zuruecksetzen: Cache Components versteckt die
    // verlassene Route via <Activity> statt sie zu unmounten, der State
    // ueberlebt also (siehe node_modules/next/dist/docs/01-app/02-guides/
    // preserving-ui-state.md, "Resetting form state on submit") - sonst
    // steht beim naechsten Oeffnen noch die zuletzt gesuchte EAN im Feld.
    setBarcode("");
    router.push(`/confirm?barcode=${encodeURIComponent(trimmed)}`);
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <h1 className="text-lg font-semibold">EAN manuell eingeben</h1>
      <form className="flex gap-2" onSubmit={handleSubmit}>
        <Input
          inputMode="numeric"
          autoFocus
          placeholder="EAN-Nummer eingeben"
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
        />
        <Button type="submit" disabled={!barcode.trim()}>
          Weiter
        </Button>
      </form>
    </div>
  );
}
