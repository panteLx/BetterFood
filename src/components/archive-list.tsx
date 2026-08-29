"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import { Archive as ArchiveIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogBackdrop,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogActions,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";
import { hideItem, restoreItem } from "@/lib/item-actions";
import { formatShort } from "@/lib/expiry";
import { REVEAL_DISTANCE, useSwipeActions } from "@/lib/use-swipe-actions";
import { cn } from "@/lib/utils";
import type { Category, Item } from "@/db/schema";

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
  const [pendingHide, setPendingHide] = useState<Item | null>(null);
  const categoryLabels = new Map(categories.map((c) => [c.key, c.label]));

  async function restore(item: Item) {
    const previous = items;
    setItems((prev) => prev.filter((entry) => entry.id !== item.id));
    try {
      await restoreItem(item.id);
      toast.success(`${item.name} wiederhergestellt`);
      router.refresh();
    } catch {
      toast.error("Konnte nicht wiederhergestellt werden.");
      setItems(previous);
    }
  }

  async function hide(item: Item) {
    const previous = items;
    setItems((prev) => prev.filter((entry) => entry.id !== item.id));
    setPendingHide(null);
    try {
      await hideItem(item.id);
      toast.success(`${item.name} ausgeblendet`);
      router.refresh();
    } catch {
      toast.error("Konnte nicht ausgeblendet werden.");
      setItems(previous);
    }
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ArchiveIcon}
        title="Das Archiv ist leer"
        body="Aufgebrauchte oder entsorgte Artikel erscheinen hier."
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2.5">
        {items.map((item) => (
          <ArchiveCard
            key={item.id}
            item={item}
            categoryLabel={categoryLabels.get(item.category) ?? item.category}
            onRestore={() => restore(item)}
            onHide={() => setPendingHide(item)}
          />
        ))}
      </div>

      {/* Ein Dialog fuer alle Zeilen statt einer je Zeile: bei 200 Eintraegen
          im Archiv waeren das 200 Dialoge im Baum. */}
      <AlertDialog
        open={pendingHide !== null}
        onOpenChange={(open) => !open && setPendingHide(null)}
      >
        <AlertDialogPortal>
          <AlertDialogBackdrop />
          <AlertDialogPopup>
            <AlertDialogTitle>„{pendingHide?.name}“ ausblenden?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Eintrag verschwindet aus dem Archiv und aus der Statistik. Was die App über die
              Kategorie dieses Produkts gelernt hat, bleibt erhalten.
            </AlertDialogDescription>
            <AlertDialogActions>
              <AlertDialogClose render={<Button variant="outline" />}>Abbrechen</AlertDialogClose>
              <AlertDialogClose
                render={<Button variant="destructive" />}
                onClick={() => pendingHide && hide(pendingHide)}
              >
                Ausblenden
              </AlertDialogClose>
            </AlertDialogActions>
          </AlertDialogPopup>
        </AlertDialogPortal>
      </AlertDialog>
    </>
  );
}

function ArchiveCard({
  item,
  categoryLabel,
  onRestore,
  onHide,
}: {
  item: Item;
  categoryLabel: string;
  onRestore: () => void;
  onHide: () => void;
}) {
  const { offset, dragging, handlers } = useSwipeActions({
    onSwipeRight: onRestore,
    onSwipeLeft: onHide,
  });
  const used = item.status === "used";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[20px] bg-surface-2 transition-colors",
        offset > 0 && "bg-primary-tint",
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-between px-5 text-[13px] font-bold"
      >
        <span
          className={cn(
            "text-primary transition-opacity",
            offset > REVEAL_DISTANCE ? "opacity-100" : "opacity-0",
          )}
        >
          Wiederherstellen
        </span>
        <span
          className={cn(
            "text-muted-foreground transition-opacity",
            offset < -REVEAL_DISTANCE ? "opacity-100" : "opacity-0",
          )}
        >
          Ausblenden
        </span>
      </div>

      <div
        {...handlers}
        style={{ transform: `translateX(${offset}px)` }}
        className={cn(
          "relative flex touch-pan-y items-center gap-3 rounded-[20px] border border-border bg-card px-3.5 py-3 select-none",
          dragging ? "transition-none" : "transition-transform duration-200",
        )}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-tight font-bold">
            {item.name}
            {item.quantity > 1 && (
              <span className="ml-2 font-semibold text-muted-foreground">×{item.quantity}</span>
            )}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "inline-flex h-5.5 items-center rounded-lg px-2.5 text-[11.5px] font-bold whitespace-nowrap",
                used ? "bg-primary-tint text-primary" : "bg-danger-tint text-danger",
              )}
            >
              {used ? "Aufgebraucht" : "Weggeworfen"}
            </span>
            <span className="text-xs leading-snug font-semibold text-muted-foreground">
              {categoryLabel}
              {item.resolvedAt && ` · ${formatShort(item.resolvedAt)}`}
            </span>
          </div>
        </div>

        {/* Die Wischgeste ist auch hier nicht der einzige Weg: mit Tastatur
            und Screenreader bleiben beide Aktionen als Buttons erreichbar. */}
        <div className="flex shrink-0 gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onRestore}
            className="rounded-xl"
          >
            Zurück
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onHide}
            className="rounded-xl text-muted-foreground"
          >
            Ausblenden
          </Button>
        </div>
      </div>
    </div>
  );
}
