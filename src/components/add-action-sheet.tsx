"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Barcode, Camera, ClipboardList, Plus, type LucideIcon } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Zentrale "Hinzufuegen"-Aktion in der Bottom-Nav: Scannen, EAN-Eingabe und
// komplett manuelle Eingabe sind kein eigenstaendiges Nav-Ziel (Destination),
// sondern drei Wege zur selben Aufgabe ("Artikel erfassen"). Nach
// Material-Design-Konvention gehoert das in eine primaere Aktion
// (FAB-artig), nicht in mehrere gleichwertige Nav-Eintraege - daher oeffnet
// ein zentraler Button dieses kurze Auswahl-Sheet statt direkt zu navigieren.
//
// Die Reihenfolge ist keine Geschmacksfrage: der Scan ist fuer alles
// Verpackte der schnellste Weg und steht deshalb hervorgehoben oben, die
// beiden anderen fangen die Faelle auf, in denen er nicht funktioniert.
const OPTIONS: {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  primary?: boolean;
}[] = [
  {
    href: "/scan",
    label: "Barcode scannen",
    hint: "Am schnellsten für Verpacktes",
    icon: Camera,
    primary: true,
  },
  {
    href: "/scan-ean",
    label: "EAN eingeben",
    hint: "Wenn die Kamera nicht mitspielt",
    icon: Barcode,
  },
  {
    href: "/add",
    label: "Von Hand eintragen",
    hint: "Salat, Reste, Selbstgemachtes",
    icon: ClipboardList,
  },
];

function AddOptionsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  function go(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Wie möchtest du hinzufügen?">
      <div className="flex flex-col gap-2">
        {OPTIONS.map((option) => (
          <button
            key={option.href}
            type="button"
            onClick={() => go(option.href)}
            className={cn(
              "flex items-center gap-3.5 rounded-[20px] p-3.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              option.primary
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-surface-2",
            )}
          >
            <option.icon
              className={cn("size-6 shrink-0", !option.primary && "text-primary")}
              strokeWidth={1.8}
            />
            <span>
              <span className="block text-base font-bold">{option.label}</span>
              <span
                className={cn(
                  "mt-0.5 block text-[13px] font-medium",
                  option.primary ? "opacity-75" : "text-muted-foreground",
                )}
              >
                {option.hint}
              </span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** Der zentrale Knopf der Navigationsleiste. */
export function AddActionSheet() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Artikel hinzufügen"
        className="flex size-16 shrink-0 items-center justify-center rounded-[20px] bg-primary text-primary-foreground shadow-[0_10px_24px_rgb(30_80_50/0.32)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-7.5" strokeWidth={2.3} />
      </button>

      <AddOptionsSheet open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * Derselbe Weg mit sichtbarer Beschriftung -- fuer den leeren Vorrat.
 *
 * Der Knopf dort fuehrte direkt in die Kamera. Das ist eine Antwort auf eine
 * Frage, die er selbst stellt ("Scanne den ersten Barcode oder trag etwas von
 * Hand ein"): wer von Hand eintragen wollte, stand trotzdem im Sucher. Er
 * oeffnet deshalb dieselbe Auswahl wie der Knopf in der Leiste.
 */
export function AddItemButton({ label }: { label: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 flex h-12 items-center rounded-2xl bg-primary px-5.5 text-[15px] font-bold text-primary-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {label}
      </button>

      <AddOptionsSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
