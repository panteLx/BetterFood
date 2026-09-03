"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"
import { Avo } from "@/components/avo"

/**
 * Der Toast des Designs ist bewusst umgedreht: helle Flaeche im Dunkelmodus,
 * dunkle im Hellmodus. Eine Rueckmeldung, die kurz erscheint und wieder geht,
 * muss sich von der Seite darunter abheben -- eine weitere Karte in
 * Kartenfarbe tut das nicht. Deshalb --foreground als Grund und --background
 * als Schrift; fuer den Akzent darauf gibt es --primary-inv, weil der
 * Primaerton auf dem umgedrehten Grund zu wenig Kontrast haette.
 *
 * Der Erfolgs-Icon ist Avo statt eines Haekchens: Abhaken bekommt keinen
 * eigenen Bildschirm (siehe /saved), die Feier findet also hier statt --
 * `onDark`, weil die Flaeche in beiden Themes dunkel bleibt.
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
        success: <Avo size="sm" mood="cheer" animation="squish" onDark />,
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
          "--border-radius": "22px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          // Sonners eigenes Padding ist rundum 16px; der Entwurf will 13px
          // oben/unten, damit die Flaeche bei der Avo-Hoehe (38px) nicht
          // unnoetig hoch wirkt.
          toast: "cn-toast p-[13px_16px]!",
          title: "font-heading! text-[14.5px]! font-bold!",
          description: "text-[12.5px]! font-semibold! text-(--normal-text)! opacity-70",
          // Sonners Aktionsknopf ist von Haus aus eine gefuellte Pille in der
          // Schriftfarbe -- auf dem umgedrehten Grund ein zweiter Block neben
          // der Meldung. Das Design zeigt stattdessen reinen Text im Akzent.
          actionButton:
            "font-heading! bg-transparent! h-auto! px-0! text-[14px]! font-bold! text-(--primary-inv)!",
          cancelButton: "bg-transparent! h-auto! px-0! text-[14px]! font-bold! opacity-60",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
