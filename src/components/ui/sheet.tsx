"use client";

import {
  Dialog,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * Das von unten einfahrende Blatt, in dem im Design jede kurze Entscheidung
 * getroffen wird: Hinzufuegen-Weg, Liste wechseln, Datum waehlen, erkanntes
 * Produkt bestaetigen.
 *
 * Bewusst eine eigene Huelle um DialogPopup und nicht jedes Mal dieselbe
 * lange Klassenkette: die Griffleiste, der Radius oben und die Polsterung
 * bis unter den Home-Indikator sind an allen vier Stellen identisch, und
 * genau dort faellt eine Abweichung sofort auf.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  hideTitle = false,
  className,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Titel nur fuer Screenreader -- fuer Blaetter, die ihre Ueberschrift selbst setzen. */
  hideTitle?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogBackdrop className="bg-(--scrim)" />
        <DialogPopup
          showClose={false}
          className={cn(
            "top-auto bottom-0 left-1/2 max-h-[92dvh] w-full max-w-md translate-y-0 flex-col gap-0 overflow-y-auto rounded-3xl rounded-b-none border-x-0 border-b-0 bg-card p-4 pt-3 pb-[calc(2rem+env(safe-area-inset-bottom))]",
            className,
          )}
        >
          <span
            aria-hidden="true"
            className="mx-auto mb-3.5 h-1 w-9.5 shrink-0 rounded-full bg-border"
          />
          <DialogTitle className={cn("px-1.5 pb-3 text-[19px] font-extrabold tracking-tight", hideTitle && "sr-only")}>
            {title}
          </DialogTitle>
          {children}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
