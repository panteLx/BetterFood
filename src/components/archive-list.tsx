"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogBackdrop,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogActions,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";
import { RotateCcw, Trash2 } from "lucide-react";
import type { Category, Item } from "@/db/schema";

function formatDate(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    date,
  );
}

// Die Artikel liegen eine Ebene hoeher (ArchiveView), damit die Statistik
// ueber der Liste denselben Stand sieht.
export function ArchiveList({
  items,
  setItems,
  categories,
}: {
  items: Item[];
  setItems: Dispatch<SetStateAction<Item[]>>;
  categories: Pick<Category, "key" | "label">[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<number | null>(null);

  const categoryLabels = Object.fromEntries(categories.map((c) => [c.key, c.label]));

  async function restoreItem(id: number, name: string) {
    setPendingId(id);
    setItems((prev) => prev.filter((item) => item.id !== id));

    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${name} wiederhergestellt`);
      router.refresh();
    } catch {
      toast.error("Konnte nicht wiederhergestellt werden.");
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  async function removeItem(id: number, name: string) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((item) => item.id !== id));
      toast.success(`${name} aus dem Archiv entfernt`);
      // Ohne das blieb der Serverstand hinter der Anzeige zurueck und der
      // Eintrag kam beim naechsten Seitenaufbau wieder.
      router.refresh();
    } catch {
      toast.error("Konnte nicht entfernt werden.");
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center text-muted-foreground">
        <p className="font-medium">Das Archiv ist leer.</p>
        <p className="text-sm">Aufgebrauchte oder entsorgte Artikel erscheinen hier.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      {items.map((item) => (
        <Card key={item.id} className="flex-row items-center justify-between gap-2 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {item.name}
              {item.quantity > 1 && (
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  ×{item.quantity}
                </span>
              )}
            </p>
            {/* flex-wrap: mit den groesseren Trefferflaechen rechts reicht
                die Zeilenbreite auf schmalen Geraeten nicht mehr fuer Badges
                und Datum nebeneinander -- ohne Umbruch verschwand das Datum
                hinter den Buttons. */}
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <Badge variant="secondary">{categoryLabels[item.category] ?? item.category}</Badge>
              <Badge variant={item.status === "used" ? "default" : "outline"}>
                {item.status === "used" ? "Aufgebraucht" : "Weggeworfen"}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatDate(item.resolvedAt)}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              size="icon-touch"
              variant="outline"
              disabled={pendingId === item.id}
              onClick={() => restoreItem(item.id, item.name)}
              aria-label="Wiederherstellen"
            >
              <RotateCcw className="size-5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    size="icon-touch"
                    variant="outline"
                    disabled={pendingId === item.id}
                    aria-label="Aus dem Archiv entfernen"
                  />
                }
              >
                <Trash2 className="size-5" />
              </AlertDialogTrigger>
              <AlertDialogPortal>
                <AlertDialogBackdrop />
                <AlertDialogPopup>
                  <AlertDialogTitle>Aus dem Archiv entfernen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    &quot;{item.name}&quot; verschwindet aus dem Archiv und aus der Statistik. Die
                    App merkt sich weiterhin, in welche Kategorie dieser Artikel gehört, damit
                    sie ihn beim nächsten Scan wiedererkennt.
                  </AlertDialogDescription>
                  <AlertDialogActions>
                    <AlertDialogClose render={<Button variant="outline" />}>
                      Abbrechen
                    </AlertDialogClose>
                    <AlertDialogClose
                      render={<Button variant="destructive" />}
                      onClick={() => removeItem(item.id, item.name)}
                    >
                      Entfernen
                    </AlertDialogClose>
                  </AlertDialogActions>
                </AlertDialogPopup>
              </AlertDialogPortal>
            </AlertDialog>
          </div>
        </Card>
      ))}
    </div>
  );
}
