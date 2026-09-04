"use client"

import { Toaster as Sonner, type ToasterProps } from "sonner"
import { InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { Avo } from "@/components/avo"

/**
 * Der Toast des Designs ist eine dunkle Flaeche -- in beiden Themes dieselbe.
 * Eine Rueckmeldung, die kurz erscheint und wieder geht, muss sich von der
 * Seite darunter abheben, und eine weitere Karte in Kartenfarbe tut das nicht.
 *
 * Vorher war er invertiert (--foreground als Grund), im Dunkelmodus also
 * cremeweiss: ein heller Blitz ueber einer dunklen Liste, jedes Mal wenn man
 * einen Artikel abhakt. Jetzt tragen --toast/--toast-foreground/--toast-accent
 * den Fall, und die haben absichtlich kein Gegenstueck im .dark-Block.
 *
 * Der Erfolgs-Icon ist Avo statt eines Haekchens: Abhaken bekommt keinen
 * eigenen Bildschirm (siehe /saved), die Feier findet also hier statt --
 * `onDark`, weil die Flaeche in beiden Themes dunkel bleibt.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      // Immer "dark": das Theme steuert bei sonner nur die eigenen
      // Farbvariablen, und die ueberschreiben wir ohnehin komplett. Der feste
      // Wert haelt den Loader und die Randfaelle auf demselben Grund.
      theme="dark"
      // font-sans mit !: sonner setzt seine eigene Systemschrift direkt auf
      // dieses Element, sonst faellt der einzige Text ausserhalb von Manrope an.
      className="toaster group font-sans!"
      icons={{
        success: (
          // Die drei Konfetti-Kruemel des Entwurfs. Sie haengen am Icon-Slot,
          // weil sonner sonst keine Stelle innerhalb des Toasts anbietet, an
          // die sich etwas haengen liesse -- die Versaetze sind deshalb vom
          // linken Innenrand (16px) aus gerechnet, nicht von der Toastkante.
          <span className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute -top-[21px] left-[20px] h-3 w-[9px] animate-confetti rounded-[3px] bg-primary [animation-duration:2.4s] [animation-delay:.1s]"
              style={{ "--dx": "-14px", "--dr": "400deg" } as React.CSSProperties}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -top-[21px] left-[114px] size-2 animate-confetti rounded-full bg-warning [animation-duration:2.7s] [animation-delay:.5s]"
              style={{ "--dx": "16px", "--dr": "-360deg" } as React.CSSProperties}
            />
            <span
              aria-hidden
              className="pointer-events-none absolute -top-[21px] left-[208px] h-3 w-[9px] animate-confetti rounded-[3px] bg-badge [animation-duration:2.5s] [animation-delay:.8s]"
              style={{ "--dx": "-10px", "--dr": "520deg" } as React.CSSProperties}
            />
            <Avo size="sm" mood="cheer" animation="squish" onDark />
          </span>
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--toast)",
          "--normal-text": "var(--toast-foreground)",
          "--normal-border": "transparent",
          "--border-radius": "22px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // Sonners eigenes Padding ist rundum 16px; der Entwurf will 13px
          // oben/unten, damit die Flaeche bei der Avo-Hoehe (38px) nicht
          // unnoetig hoch wirkt. overflow-visible, damit die Konfetti-Kruemel
          // ueber der Oberkante starten duerfen -- sonner schneidet den Toast
          // sonst an seinem Radius ab.
          toast: "cn-toast gap-3! p-[13px_16px]! shadow-sheet! overflow-visible!",
          // Der Icon-Slot ist bei sonner auf Icongroesse gedeckelt; Avo ist
          // 30px breit und die Kruemel liegen ausserhalb.
          icon: "m-0! size-auto! w-auto! overflow-visible!",
          content: "gap-0!",
          title: "font-heading! text-[14.5px]! leading-snug! font-bold!",
          description: "mt-0.5! text-[12.5px]! font-semibold! text-(--normal-text)! opacity-70",
          // Sonners Aktionsknopf ist von Haus aus eine gefuellte Pille in der
          // Schriftfarbe -- auf dem dunklen Grund ein zweiter Block neben der
          // Meldung. Das Design zeigt stattdessen reinen Text im Akzent.
          actionButton:
            "font-heading! bg-transparent! h-auto! shrink-0! px-0! text-[14px]! font-bold! text-(--toast-accent)!",
          cancelButton: "bg-transparent! h-auto! shrink-0! px-0! text-[14px]! font-bold! opacity-60",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
