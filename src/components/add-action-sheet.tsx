"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ClipboardList, Hash, Plus } from "lucide-react";
import { Dialog, DialogPortal, DialogBackdrop, DialogPopup, DialogTitle } from "@/components/ui/dialog";

// Zentrale "Hinzufuegen"-Aktion in der Bottom-Nav: Scannen, EAN-Eingabe und
// komplett manuelle Eingabe sind kein eigenstaendiges Nav-Ziel (Destination),
// sondern drei Wege zur selben Aufgabe ("Artikel erfassen"). Nach
// Material-Design-Konvention gehoert das in eine primaere Aktion
// (FAB-artig), nicht in mehrere gleichwertige Nav-Eintraege - daher oeffnet
// ein zentraler Button dieses kurze Auswahl-Sheet statt direkt zu navigieren.
const OPTIONS = [
  { href: "/scan", label: "Barcode scannen", icon: Camera },
  { href: "/scan-ean", label: "EAN manuell eingeben", icon: Hash },
  { href: "/add", label: "Komplett manuell eingeben", icon: ClipboardList },
] as const;

export function AddActionSheet() {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Artikel hinzufügen"
        className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none"
      >
        <Plus className="size-6" />
      </button>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup
          showClose={false}
          className="top-auto bottom-0 left-1/2 w-full max-w-md translate-y-0 flex-col gap-2 rounded-b-none border-b-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
        >
          <DialogTitle className="px-2 text-sm font-medium text-muted-foreground">
            Artikel hinzufügen
          </DialogTitle>
          {OPTIONS.map((option) => (
            <button
              key={option.href}
              type="button"
              onClick={() => go(option.href)}
              className="flex items-center gap-3 rounded-lg p-3 text-left text-base hover:bg-accent"
            >
              <option.icon className="size-5 text-muted-foreground" />
              {option.label}
            </button>
          ))}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
