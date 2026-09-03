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
          // Das Blatt faehrt von unten ein statt zu skalieren. Der Basis-Popup
          // animiert nur scale und opacity -- ein Blatt, das aus der Mitte
          // heraus waechst, kommt nicht von dort, wo der Daumen es erwartet.
          // Deshalb hier transform in den Uebergang aufgenommen und die
          // Start-/Endlage auf translate-y-full gesetzt.
          className={cn(
            "top-auto bottom-0 left-1/2 max-h-[92dvh] w-full max-w-md translate-y-0 flex-col gap-0 overflow-y-auto rounded-[34px] rounded-b-none border-0 bg-card px-4 pt-3.5 pb-[max(env(safe-area-inset-bottom),2rem)] shadow-sheet transition-[transform,opacity] duration-400 ease-[cubic-bezier(0.2,0.8,0.3,1)] data-ending-style:translate-y-full data-ending-style:scale-100 data-starting-style:translate-y-full data-starting-style:scale-100",
            className,
          )}
        >
          <span
            aria-hidden="true"
            className="mx-auto mb-4 h-[5px] w-11 shrink-0 rounded-full bg-hairline"
          />
          <DialogTitle className={cn("px-1.5 pb-3 font-heading text-[20px] font-bold tracking-tight", hideTitle && "sr-only")}>
            {title}
          </DialogTitle>
          {children}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
