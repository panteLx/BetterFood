"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";

export function ManualAddDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [barcodeEntry, setBarcodeEntry] = useState(false);
  const [barcode, setBarcode] = useState("");

  function reset(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setBarcodeEntry(false);
      setBarcode("");
    }
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger render={<Button variant="outline" className="w-full" size="lg" />}>
        <Plus className="size-4" />
        Manuell
      </DialogTrigger>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPopup>
          <DialogTitle>Artikel hinzufügen</DialogTitle>
          {barcodeEntry ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = barcode.trim();
                if (!trimmed) return;
                router.push(`/confirm?barcode=${encodeURIComponent(trimmed)}`);
              }}
            >
              <Input
                inputMode="numeric"
                autoFocus
                placeholder="EAN-Nummer eingeben"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
              />
              <Button type="submit" disabled={!barcode.trim()}>
                Weiter
              </Button>
            </form>
          ) : (
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={() => setBarcodeEntry(true)}>
                EAN manuell eingeben
              </Button>
              <Button onClick={() => router.push("/add")}>Komplett manuell</Button>
            </div>
          )}
        </DialogPopup>
      </DialogPortal>
    </Dialog>
  );
}
