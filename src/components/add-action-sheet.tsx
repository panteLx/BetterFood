"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Barcode,
  Camera,
  ClipboardList,
  Plus,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { Avo } from "@/components/avo";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

// Zentrale "Hinzufuegen"-Aktion in der Bottom-Nav: Scannen, EAN-Eingabe,
// manuelle Eingabe und Rechnung sind kein eigenstaendiges Nav-Ziel
// (Destination), sondern vier Wege zur selben Aufgabe ("Artikel erfassen").
// Nach Material-Design-Konvention gehoert das in eine primaere Aktion
// (FAB-artig), nicht in mehrere gleichwertige Nav-Eintraege - daher oeffnet
// ein zentraler Button dieses kurze Auswahl-Sheet statt direkt zu navigieren.
//
// Die Reihenfolge ist keine Geschmacksfrage: der Scan ist fuer alles
// Verpackte der schnellste Weg und steht deshalb hervorgehoben oben, die
// naechsten beiden fangen die Faelle auf, in denen er nicht funktioniert.
const OPTIONS: {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  primary?: boolean;
  /** Fläche und Textfarbe des 46px-Rundfelds -- pro Option ein eigener
   *  Zustandston, damit die vier Wege auch ohne Text auseinanderzuhalten
   *  sind. Die hervorgehobene Option liegt selbst schon auf der
   *  Verlaufsfläche, ihr Feld braucht deshalb nur ein halbtransparentes
   *  Weiß statt eines eigenen Tons. */
  field: string;
}[] = [
  {
    href: "/scan",
    label: "Barcode scannen",
    hint: "Am schnellsten für Verpacktes",
    icon: Camera,
    primary: true,
    field: "bg-white/22",
  },
  {
    href: "/scan-ean",
    label: "EAN eingeben",
    hint: "Wenn die Kamera nicht mitspielt",
    icon: Barcode,
    field: "bg-primary-tint text-primary-deep",
  },
  {
    href: "/add",
    label: "Von Hand eintragen",
    hint: "Salat, Reste, Selbstgemachtes",
    icon: ClipboardList,
    field: "bg-warning-tint text-warning-ink",
  },
  // Steht unten, weil er einen ganzen Einkauf auf einmal erfasst statt eines
  // Artikels -- und weil er als einziger etwas voraussetzt, das man nicht in
  // der Hand hat: eine PDF-Rechnung.
  {
    href: "/receipt",
    label: "Rechnung einlesen",
    hint: "Wenn Lebensmittel geliefert wurden",
    icon: Receipt,
    field: "bg-badge-tint text-badge-ink",
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
    <Sheet open={open} onOpenChange={onOpenChange} title="Was soll rein?" hideTitle>
      {/* Sheet liefert den Titel schon barrierefrei (sr-only, via hideTitle)
          -- diese Zeile ist die sichtbare Wiederholung mit Avo daneben und
          deshalb aria-hidden, sonst kuendigte ein Screenreader "Was soll
          rein?" zweimal an. */}
      <div aria-hidden="true" className="flex items-center gap-2.75 px-1 pb-3.5">
        <Avo size="sm" mood="happy" />
        <span className="font-heading text-[20px] font-bold">Was soll rein?</span>
      </div>
      <div className="flex flex-col gap-2.25">
        {OPTIONS.map((option) => (
          <button
            key={option.href}
            type="button"
            onClick={() => go(option.href)}
            className={cn(
              "flex items-center gap-3.5 rounded-[24px] p-[15px] text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              option.primary
                ? "bg-(image:--gradient-primary) text-primary-foreground shadow-cta"
                : "bg-surface-2",
            )}
          >
            <span
              className={cn(
                "flex size-[46px] shrink-0 items-center justify-center rounded-full",
                option.field,
              )}
            >
              <option.icon className="size-[23px]" strokeWidth={2} />
            </span>
            <span>
              <span className="block font-heading text-[17px] font-bold">{option.label}</span>
              <span
                className={cn(
                  "mt-0.5 block text-[12.5px] font-medium",
                  option.primary ? "opacity-[.82]" : "text-muted-foreground",
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

/**
 * Der zentrale Knopf der Navigationsleiste.
 *
 * Die Insel gibt ihm wieder einen Boden, auf dem er aufliegen kann -- damit
 * ueberragt er sie erneut (siehe das negative margin-top in bottom-nav.tsx),
 * statt gleich gross in der Reihe zu stehen wie in der Vorgaengerfassung.
 * Er bleibt trotzdem die primaere Aktion: die Verlaufsflaeche ist das einzige
 * gefuellte, gesaettigte Element neben vier duenn gezeichneten Umrissen.
 *
 * className, damit derselbe Knopf auch als groesserer Einzelgaenger unten
 * rechts auftreten kann, wenn die Leiste beim Lesen weggefahren ist (siehe
 * bottom-nav.tsx). Es bleibt bewusst derselbe Knopf mit demselben Sheet: zwei
 * Wege zum Hinzufuegen, die sich unterschiedlich verhalten, waeren einer zu
 * viel.
 */
export function AddActionSheet({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Artikel hinzufügen"
        title="Artikel hinzufügen"
        className={cn(
          "flex size-14 shrink-0 items-center justify-center rounded-full bg-(image:--gradient-primary) text-primary-foreground shadow-fab outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          className,
        )}
      >
        <Plus className="size-6.5" strokeWidth={2.8} />
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
        className="mt-1 flex h-[54px] items-center rounded-[20px] bg-(image:--gradient-primary) px-[26px] font-heading text-[16px] font-bold text-primary-foreground shadow-cta outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {label}
      </button>

      <AddOptionsSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
