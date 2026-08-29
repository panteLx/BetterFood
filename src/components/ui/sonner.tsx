"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/**
 * Der Toast des Designs ist bewusst umgedreht: helle Flaeche im Dunkelmodus,
 * dunkle im Hellmodus. Eine Rueckmeldung, die kurz erscheint und wieder geht,
 * muss sich von der Seite darunter abheben -- eine weitere Karte in
 * Kartenfarbe tut das nicht. Deshalb --foreground als Grund und --background
 * als Schrift; fuer den Akzent darauf gibt es --primary-inv, weil der
 * Primaerton auf dem umgedrehten Grund zu wenig Kontrast haette.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme } = useTheme()

  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      // font-sans mit !: sonner setzt seine eigene Systemschrift direkt auf
      // dieses Element, sonst faellt der einzige Text ausserhalb von Manrope an.
      className="toaster group font-sans!"
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
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
          "--normal-bg": "var(--foreground)",
          "--normal-text": "var(--background)",
          "--normal-border": "transparent",
          "--border-radius": "16px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
          title: "text-[14px]! font-semibold!",
          description: "text-[13px]! font-medium! text-(--normal-text)! opacity-70",
          // Sonners Aktionsknopf ist von Haus aus eine gefuellte Pille in der
          // Schriftfarbe -- auf dem umgedrehten Grund ein zweiter Block neben
          // der Meldung. Das Design zeigt stattdessen reinen Text im Akzent.
          actionButton:
            "bg-transparent! h-auto! px-0! text-[14px]! font-bold! text-(--primary-inv)!",
          cancelButton: "bg-transparent! h-auto! px-0! text-[14px]! font-bold! opacity-60",
          // Erfolg ist der Normalfall (abgehakt, entsorgt, gespeichert) und
          // steht schon im Text. Das Haekchen daneben ist Dekoration; bei
          // Warnung und Fehler bleibt das Symbol, weil es dort etwas hinzufuegt.
          success: "[&_[data-icon]]:hidden!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
