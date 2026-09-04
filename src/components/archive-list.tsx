"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";
import {
  EyeOff,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Sheet } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { hideItem, restoreItem } from "@/lib/item-actions";
import { formatShort, STATUS_CLASSES } from "@/lib/expiry";
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
  const [pendingActions, setPendingActions] = useState<Item | null>(null);
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
      // Dieselbe Karte wie der leere Vorrat: ein leeres Archiv ist genauso ein
      // Bildschirm ohne einen einzigen Datenpunkt, und die Statistik darueber
      // faellt dann ohnehin weg (siehe ArchiveView). Ohne die Karte stand hier
      // nur Text auf dem nackten Seitengrund.
      <EmptyState
        icon="mascot"
        variant="card"
        title="Das Archiv ist leer"
        body="Aufgebrauchte oder entsorgte Artikel erscheinen hier."
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-[9px]">
        {items.map((item) => (
          <ArchiveCard
            key={item.id}
            item={item}
            categoryLabel={categoryLabels.get(item.category) ?? item.category}
            onRestore={() => restore(item)}
            onHide={() => setPendingHide(item)}
            onOpenActions={() => setPendingActions(item)}
          />
        ))}
      </div>

      {/* Wie im Vorrat sind Wischen nach rechts (zurueckholen) und nach links
          (ausblenden) der schnelle Weg. Beide sind mit Tastatur und
          Screenreader nicht bedienbar, und anders als eine Vorratszeile hat
          ein Archiv-Eintrag keine Detailseite, auf der dieselben Aktionen als
          Buttons stuenden -- deshalb oeffnet das Antippen der Zeile sie hier.

          Ein Blatt fuer alle Zeilen statt eines je Zeile: bei 200 Eintraegen
          im Archiv waeren das 200 Dialoge im Baum. Dasselbe gilt fuer den
          Rueckfrage-Dialog darunter. */}
      <Sheet
        open={pendingActions !== null}
        onOpenChange={(open) => !open && setPendingActions(null)}
        title={pendingActions?.name ?? ""}
      >
        <div className="flex flex-col gap-2">
          <SheetAction
            icon={RotateCcw}
            label="Wiederherstellen"
            hint="Zurück in den Vorrat"
            onClick={() => {
              const item = pendingActions;
              setPendingActions(null);
              if (item) restore(item);
            }}
          />
          <SheetAction
            icon={EyeOff}
            label="Ausblenden"
            hint="Verschwindet aus Archiv und Statistik"
            onClick={() => {
              const item = pendingActions;
              setPendingActions(null);
              if (item) setPendingHide(item);
            }}
          />
        </div>
      </Sheet>

      <ConfirmDialog
        open={pendingHide !== null}
        onOpenChange={(open) => !open && setPendingHide(null)}
        icon={EyeOff}
        title={<>„{pendingHide?.name}“ ausblenden?</>}
        description="Der Eintrag verschwindet aus dem Archiv und aus der Statistik. Was die App über dieses Produkt gelernt hat, bleibt erhalten."
        confirmLabel="Ausblenden"
        onConfirm={() => pendingHide && hide(pendingHide)}
      />
    </>
  );
}

function ArchiveCard({
  item,
  categoryLabel,
  onRestore,
  onHide,
  onOpenActions,
}: {
  item: Item;
  categoryLabel: string;
  onRestore: () => void;
  onHide: () => void;
  onOpenActions: () => void;
}) {
  const { offset, dragging, wasSwipe, handlers } = useSwipeActions({
    onSwipeRight: onRestore,
    onSwipeLeft: onHide,
  });
  const used = item.status === "used";

  return (
    <div
      // overflow-x-clip statt overflow-hidden: siehe item-row.tsx.
      className={cn(
        "relative overflow-x-clip rounded-[24px] bg-surface-2 transition-colors",
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
        // Nur waehrend der Geste ein Transform. Ein Element mit
        // transform wird von den Browsern nicht mehr auf ganze
        // Geraetepixel gerundet, und weil die Zeile bruchteilig hoch
        // ist (72,75px), verblasste die 1px-Unterkante dabei bis zur
        // Unsichtbarkeit -- je nach Position in der Liste mal mehr,
        // mal weniger. Auf translateX(0px) zu verzichten kostet
        // nichts: die Rueckfeder-Animation laeuft weiterhin, weil
        // CSS gegen "none" wie gegen die Identitaet interpoliert.
        style={
          offset === 0 ? undefined : { transform: `translateX(${offset}px)` }
        }
        className={cn(
          "relative flex touch-pan-y items-center rounded-[24px] bg-card shadow-row select-none",
          dragging ? "transition-none" : "transition-transform duration-200",
        )}
      >
        <button
          type="button"
          onClick={() => {
            // Nach einer Wischgeste darf das abschliessende Click-Event das
            // Blatt nicht mit oeffnen.
            if (wasSwipe()) return;
            onOpenActions();
          }}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[24px] px-4 py-[13px] text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate font-heading text-base leading-tight font-bold">
              {item.name}
              {item.quantity > 1 && (
                <span className="ml-2 font-mono text-[12.5px] text-faint">×{item.quantity}</span>
              )}
            </span>
            <span className="mt-[7px] flex flex-wrap items-center gap-[7px]">
              <span
                className={cn(
                  "inline-flex h-6 items-center rounded-full px-[11px] text-[11.5px] font-bold whitespace-nowrap",
                  // Dieselben zwei Toenungen wie im Vorrat, aus derselben
                  // Tabelle: "aufgebraucht" liest sich wie "frisch",
                  // "weggeworfen" wie "abgelaufen".
                  used ? STATUS_CLASSES.fresh.chip : STATUS_CLASSES.expired.chip,
                )}
              >
                {used ? "Aufgebraucht" : "Weggeworfen"}
              </span>
              <span className="text-[12px] leading-snug font-semibold text-faint">
                {categoryLabel}
                {item.resolvedAt && ` · ${formatShort(item.resolvedAt)}`}
              </span>
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}

function SheetAction({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3.5 rounded-[20px] bg-surface-2 p-3.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <Icon className="size-6 shrink-0 text-primary" strokeWidth={1.8} />
      <span>
        <span className="block font-heading text-base font-bold">{label}</span>
        <span className="mt-0.5 block text-[13px] font-medium text-muted-foreground">
          {hint}
        </span>
      </span>
    </button>
  );
}
