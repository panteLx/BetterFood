"use client";

import { Trash2, type LucideIcon } from "lucide-react";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogBackdrop,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";

/**
 * Die eine Rueckfrage vor allem Unwiderruflichen: Artikel loeschen, Eintrag
 * ausblenden, Ort entfernen, Liste loeschen.
 *
 * Vorher stand an jeder dieser Stellen derselbe Dialog neu zusammengebaut --
 * Titel, Text, dann "Abbrechen | Loeschen" nebeneinander rechts unten. Das
 * Design stellt die Frage anders: Symbol in der Warnfarbe, Frage und Folge
 * zentriert darunter, die gefaehrliche Aktion als voller Knopf und das
 * Abbrechen als ruhiger Text darunter. Auf dem Telefon ist das der Unterschied
 * zwischen zwei gleich aussehenden Knoepfen am Daumen und einer Antwort, die
 * man liest.
 *
 * Entweder mit `trigger` (der Dialog verwaltet sich selbst) oder mit
 * `open`/`onOpenChange` (wenn der Ausloeser woanders liegt, etwa in einer
 * Wischgeste).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  icon: Icon = Trash2,
  title,
  description,
  confirmLabel,
  onConfirm,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactElement;
  icon?: LucideIcon;
  title: React.ReactNode;
  description: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger && <AlertDialogTrigger render={trigger} />}
      <AlertDialogPortal>
        <AlertDialogBackdrop className="bg-(--scrim)" />
        <AlertDialogPopup className="max-w-[340px] items-center gap-0 rounded-2xl border-0 bg-card p-6 text-center text-foreground shadow-card">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-danger-tint text-danger">
            <Icon className="size-6" strokeWidth={1.9} />
          </span>
          <AlertDialogTitle className="mt-4 text-[19px] leading-snug font-extrabold text-balance">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-2 text-[13.5px] leading-relaxed font-medium text-balance text-muted-foreground">
            {description}
          </AlertDialogDescription>
          {/* text-background statt Weiss: im Dunkelmodus ist --danger ein
              heller Lachston, auf dem weisse Schrift kaum noch lesbar ist.
              Im Hellmodus ist der Unterschied zu Weiss nicht zu sehen. */}
          <AlertDialogClose
            onClick={onConfirm}
            className="mt-5 h-13 w-full rounded-[16px] bg-danger text-[15px] font-bold text-background outline-none focus-visible:ring-3 focus-visible:ring-danger/40"
          >
            {confirmLabel}
          </AlertDialogClose>
          <AlertDialogClose className="mt-1 h-12 w-full rounded-[16px] text-[15px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            Abbrechen
          </AlertDialogClose>
        </AlertDialogPopup>
      </AlertDialogPortal>
    </AlertDialog>
  );
}
