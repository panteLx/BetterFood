"use client";

import { useRouter } from "next/navigation";
import { Dialog, DialogPortal, DialogBackdrop, DialogPopup } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Wird von abgefangenen (intercepted) Routen wie /add oder /edit/[id] genutzt,
// um sich ueber der dahinterliegenden Seite zu zeigen, statt sie zu ersetzen.
// "open" ist immer true - das Mounten/Unmounten dieser Komponente UEBER die
// Route selbst ist bereits der Auf/Zu-Zustand (siehe
// node_modules/next/dist/docs/.../parallel-routes.md#modals). Schliessen
// (Backdrop-Klick, Escape, X) navigiert daher immer per router.back(), statt
// den Modal-State lokal zu verwalten.
//
// Zwei Ausbaustufen: "sheet" fuer kurze Eingaben, die den Kontext dahinter
// sichtbar lassen sollen (EAN eintippen), und "fullscreen" fuer das
// Artikelformular. Das Formular ist mit Name, Ort, Kategorie, Datum und Notiz
// kein Zwischenruf, sondern eine eigene Aufgabe: als Blatt schob die Tastatur
// es auf wenige sichtbare Zeilen zusammen, waehrend oben ein Streifen der
// alten Seite stehen blieb, den man nicht bedienen kann.
export function RouteModal({
  variant = "sheet",
  children,
}: {
  variant?: "sheet" | "fullscreen";
  children: React.ReactNode;
}) {
  const router = useRouter();
  const fullscreen = variant === "fullscreen";

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) router.back();
      }}
    >
      <DialogPortal>
        <DialogBackdrop className="bg-(--scrim)" />
        <DialogPopup
          showClose={false}
          className={cn(
            "left-1/2 w-full max-w-md translate-y-0 flex-col gap-0 overflow-y-auto border-0 p-0 shadow-none",
            fullscreen
              ? // Der obere Abstand kommt hier noch einmal: das Modal haengt im
                // Portal und damit ausserhalb des Layout-Containers, der ihn
                // sonst fuer alle Seiten setzt.
                "top-0 h-dvh max-h-dvh rounded-none bg-background pt-[max(env(safe-area-inset-top),1.75rem)]"
              : // 34px -- derselbe obere Radius wie die Sheet-Primitive
                // (src/components/ui/sheet.tsx). Eine abgefangene Route ist
                // fuer den Daumen dasselbe Blatt wie ein echtes Sheet, und
                // zehn Pixel Unterschied im Eck waeren genau die Art Detail,
                // die man nicht benennen, aber spueren kann.
                "top-auto bottom-0 max-h-[92dvh] rounded-[34px] rounded-b-none bg-background pt-3.5 shadow-sheet",
          )}
        >
          {/* Griffleiste statt Schliessen-Kreuz: das Formular darunter bringt
              seinen eigenen Zurueck-Pfeil mit, und zwei Schliesswege
              nebeneinander sind einer zu viel. Im Vollbild gibt es nichts zu
              ziehen -- dort bleibt nur der Pfeil. Masse wie die
              Sheet-Primitive, aus demselben Grund wie der Radius oben. */}
          {!fullscreen && (
            <span
              aria-hidden="true"
              className="mx-auto mb-4 h-[5px] w-11 shrink-0 rounded-full bg-hairline"
            />
          )}
          {children}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
