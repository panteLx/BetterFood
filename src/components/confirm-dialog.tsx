"use client";

import { useState } from "react";
import { Check, Trash2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
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
 *
 * `tone` faerbt Symbol und Knopf um, mehr nicht. Es gibt eine zweite Sorte
 * Rueckfrage, die nichts zerstoert, sondern etwas Unvollstaendiges bestaetigt
 * ("nur 28 von 34 Artikeln uebernehmen?"). Sie in Rot zu stellen waere
 * gelogen, ihr einen eigenen Dialog danebenzustellen schlimmer -- also
 * dieselbe Frageform in der Primaerfarbe. "warning" ist die dritte davon: kein
 * Verlust und kein Formfehler, sondern eine Entscheidung mit Folgen fuer
 * andere ("ueber die Grenze hinaus Rezepte erzeugen").
 *
 * `acknowledge` macht aus der Frage eine, die man nicht wegtippen kann: Der
 * Bestaetigungsknopf bleibt gesperrt, bis der Haken gesetzt ist. Nur fuer die
 * wenigen Faelle, in denen jemand ausdruecklich Verantwortung uebernimmt --
 * an jeder gewoehnlichen Rueckfrage waere das eine Schikane, und wer drei
 * Haken am Tag setzt, liest den vierten nicht mehr.
 */
/**
 * Die drei Toenungen als Tabelle statt als verschachtelte Ternaeroperatoren.
 *
 * Mit der dritten stand dieselbe Fallunterscheidung zweimal im JSX -- einmal
 * fuer das Symbolfeld, einmal fuer den Knopf --, und eine vierte haette beide
 * angefasst. Der Haken hatte gar keine: Er war fest auf --warning gestellt,
 * was ihn auf einem roten Loeschdialog gelb aufleuchten liesse. Als Zeile in
 * dieser Tabelle folgt er der Toenung von selbst.
 */
const TONES = {
  danger: {
    chip: "bg-danger-tint text-danger",
    button: "bg-danger text-background focus-visible:ring-danger/40",
    check: "bg-danger text-background",
  },
  primary: {
    chip: "bg-primary-tint text-primary",
    button: "bg-primary text-primary-foreground focus-visible:ring-ring/50",
    check: "bg-primary text-primary-foreground",
  },
  warning: {
    chip: "bg-warning-tint text-warning-ink",
    button: "bg-warning text-warning-on focus-visible:ring-warning/40",
    check: "bg-warning text-warning-on",
  },
} as const;

export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  icon: Icon = Trash2,
  tone = "danger",
  title,
  description,
  acknowledge,
  confirmLabel,
  onConfirm,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactElement;
  icon?: LucideIcon;
  tone?: keyof typeof TONES;
  title: React.ReactNode;
  description: React.ReactNode;
  acknowledge?: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
}) {
  const [checked, setChecked] = useState(false);

  function handleOpenChange(next: boolean) {
    // Beim Schliessen zuruecksetzen. Ein Haken, der vom vorigen Mal noch
    // steht, ist keine bewusste Entscheidung mehr -- und genau die ist hier
    // der Zweck.
    if (!next) setChecked(false);
    onOpenChange?.(next);
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      {trigger && <AlertDialogTrigger render={trigger} />}
      <AlertDialogPortal>
        <AlertDialogBackdrop className="bg-(--scrim)" />
        <AlertDialogPopup className="max-w-[340px] items-center gap-0 rounded-2xl border-0 bg-card p-6 text-center text-foreground shadow-card">
          <span
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-[16px]",
              TONES[tone].chip,
            )}
          >
            <Icon className="size-6" strokeWidth={1.9} />
          </span>
          <AlertDialogTitle className="mt-4 text-[19px] leading-snug font-extrabold text-balance">
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="mt-2 text-[13.5px] leading-relaxed font-medium text-balance text-muted-foreground">
            {description}
          </AlertDialogDescription>
          {/* Der Haken sitzt zwischen Frage und Knopf, weil er in dieser
              Reihenfolge gelesen wird: erst was passiert, dann die Zusage,
              dann die Tat. Ein <button role="checkbox"> wie beim Switch in
              ui/switch.tsx -- die ganze Zeile ist die Trefferflaeche, auf
              einem Telefon ist ein 20px-Kaestchen keine. */}
          {acknowledge && (
            <button
              type="button"
              role="checkbox"
              aria-checked={checked}
              onClick={() => setChecked((value) => !value)}
              className="mt-4 flex w-full items-start gap-2.5 rounded-[14px] bg-surface-2 p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span
                className={cn(
                  "mt-px flex size-5 shrink-0 items-center justify-center rounded-[7px] transition-colors",
                  checked ? TONES[tone].check : "bg-card shadow-row",
                )}
              >
                {checked && <Check className="size-3.5" strokeWidth={3.2} />}
              </span>
              <span className="text-[12.5px] leading-snug font-semibold text-muted-foreground">
                {acknowledge}
              </span>
            </button>
          )}
          {/* text-background statt Weiss: im Dunkelmodus ist --danger ein
              heller Lachston, auf dem weisse Schrift kaum noch lesbar ist.
              Im Hellmodus ist der Unterschied zu Weiss nicht zu sehen. */}
          <AlertDialogClose
            onClick={onConfirm}
            disabled={Boolean(acknowledge) && !checked}
            className={cn(
              "mt-5 h-13 w-full rounded-[16px] text-[15px] font-bold outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50",
              TONES[tone].button,
            )}
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
