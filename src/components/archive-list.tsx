"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

export function ArchiveList({
  initialItems,
  categories,
}: {
  initialItems: Item[];
  categories: Pick<Category, "key" | "label">[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<number | null>(null);

  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }

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
      setItems(initialItems);
    } finally {
      setPendingId(null);
    }
  }

  async function deleteItem(id: number, name: string) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/items/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setItems((prev) => prev.filter((item) => item.id !== id));
      toast.success(`${name} endgültig gelöscht`);
    } catch {
      toast.error("Konnte nicht gelöscht werden.");
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
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary">{categoryLabels[item.category] ?? item.category}</Badge>
              <Badge variant={item.status === "used" ? "default" : "outline"}>
                {item.status === "used" ? "Aufgebraucht" : "Weggeworfen"}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatDate(item.resolvedAt)}</span>
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <Button
              size="icon"
              variant="outline"
              disabled={pendingId === item.id}
              onClick={() => restoreItem(item.id, item.name)}
              aria-label="Wiederherstellen"
            >
              <RotateCcw className="size-4" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={pendingId === item.id}
                    aria-label="Endgültig löschen"
                  />
                }
              >
                <Trash2 className="size-4" />
              </AlertDialogTrigger>
              <AlertDialogPortal>
                <AlertDialogBackdrop />
                <AlertDialogPopup>
                  <AlertDialogTitle>Endgültig löschen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    &quot;{item.name}&quot; wird unwiderruflich gelöscht. Das kann nicht rückgängig
                    gemacht werden.
                  </AlertDialogDescription>
                  <AlertDialogActions>
                    <AlertDialogClose render={<Button variant="outline" />}>
                      Abbrechen
                    </AlertDialogClose>
                    <AlertDialogClose
                      render={<Button variant="destructive" />}
                      onClick={() => deleteItem(item.id, item.name)}
                    >
                      Löschen
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
