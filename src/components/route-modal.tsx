"use client";

import { useRouter } from "next/navigation";
import { Dialog, DialogPortal, DialogBackdrop, DialogPopup } from "@/components/ui/dialog";

// Wird von abgefangenen (intercepted) Routen wie /add oder /edit/[id] genutzt,
// um sich als Sheet ueber der dahinterliegenden Seite zu zeigen, statt sie zu
// ersetzen. "open" ist immer true - das Mounten/Unmounten dieser Komponente
// UEBER die Route selbst ist bereits der Auf/Zu-Zustand (siehe
// node_modules/next/dist/docs/.../parallel-routes.md#modals). Schliessen
// (Backdrop-Klick, Escape, X) navigiert daher immer per router.back(), statt
// den Modal-State lokal zu verwalten.
export function RouteModal({ children }: { children: React.ReactNode }) {
  const router = useRouter();

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
          className="top-auto bottom-0 left-1/2 max-h-[92dvh] w-full max-w-md translate-y-0 flex-col gap-0 overflow-y-auto rounded-3xl rounded-b-none border-x-0 border-b-0 bg-background p-0 pt-3"
        >
          {/* Griffleiste statt Schliessen-Kreuz: das Formular darunter bringt
              seinen eigenen Zurueck-Pfeil mit, und zwei Schliesswege
              nebeneinander sind einer zu viel. */}
          <span
            aria-hidden="true"
            className="mx-auto mb-1 h-1 w-9.5 shrink-0 rounded-full bg-border"
          />
          {children}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
