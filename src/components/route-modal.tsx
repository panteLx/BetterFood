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
        <DialogBackdrop />
        <DialogPopup className="top-auto bottom-0 left-1/2 max-h-[90dvh] w-full max-w-md translate-y-0 flex-col overflow-y-auto rounded-b-none">
          {children}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
