"use client";

import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import {
  STATUS_CLASSES,
  daysUntil,
  expiryLabel,
  expiryStatus,
} from "@/lib/expiry";
import { REVEAL_DISTANCE, useSwipeActions } from "@/lib/use-swipe-actions";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";
import type { Item } from "@/db/schema";

/**
 * Eine Zeile im Vorrat.
 *
 * Die beiden haeufigsten Aktionen liegen in der Wischgeste: nach rechts
 * heisst aufgebraucht, nach links weggeworfen. Vorher standen dafuer drei
 * Icon-Buttons in jeder Zeile, die zusammen mehr Platz brauchten als der
 * Artikelname selbst.
 *
 * Die Geste ist bewusst NICHT der einzige Weg: das Antippen fuehrt auf die
 * Detailseite, wo dieselben Aktionen als richtige Buttons stehen. Eine
 * Wischgeste ist per Tastatur und mit Screenreader nicht bedienbar, und ein
 * Vorrat, den man nur mit dem Finger abhaken kann, waere fuer einen Teil der
 * Nutzer gar nicht bedienbar.
 */
export function ItemCard({
  item,
  meta,
  onConsume,
  onDiscard,
  disabled = false,
}: {
  item: Item;
  /** Zweitzeile: je nach Gruppierung die Kategorie oder der Ort. */
  meta: string;
  onConsume: () => void;
  onDiscard: () => void;
  disabled?: boolean;
}) {
  const router = useRouter();
  const { offset, dragging, wasSwipe, handlers } = useSwipeActions({
    onSwipeRight: onConsume,
    onSwipeLeft: onDiscard,
    disabled,
  });

  // Die Statusfarbe haengt am heutigen Datum -- bis zur Hydration bleibt sie
  // deshalb neutral, statt den Prerender der Route zu sprengen.
  const isClient = useIsClient();
  const days = isClient ? daysUntil(item.expiryDate) : 0;
  const styles = STATUS_CLASSES[expiryStatus(days)];

  return (
    <div
      // overflow-x-clip, nicht overflow-hidden: geschnitten werden muss nur
      // waagerecht, damit die weggewischte Karte nicht ueber den Seitenrand
      // laeuft. Ein senkrechter Clip hat hier nichts zu tun und schnitt bei
      // bruchteiliger Zeilenhoehe die Unterkante der Karte an.
      className={cn(
        "relative overflow-x-clip rounded-[20px] transition-colors",
        offset > 0
          ? "bg-primary-tint"
          : offset < 0
            ? "bg-danger-tint"
            : "bg-surface-2",
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
          Aufgebraucht
        </span>
        <span
          className={cn(
            "text-danger transition-opacity",
            offset < -REVEAL_DISTANCE ? "opacity-100" : "opacity-0",
          )}
        >
          Weggeworfen
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
          "relative flex touch-pan-y items-center rounded-[20px] border border-l-3 border-border bg-card select-none",
          styles.border,
          dragging ? "transition-none" : "transition-transform duration-200",
        )}
      >
        <button
          type="button"
          onClick={() => {
            // Nach einer Wischgeste darf das abschliessende Click-Event die
            // Detailseite nicht mit oeffnen.
            if (wasSwipe()) return;
            router.push(`/item/${item.id}`);
          }}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[20px] py-3 pr-3 pl-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-[15px]",
              styles.tint,
              styles.text,
            )}
          >
            <CategoryIcon categoryKey={item.category} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] leading-tight font-bold">
              {item.name}
              {item.quantity > 1 && (
                <span className="ml-2 text-muted-foreground">
                  ×{item.quantity}
                </span>
              )}
            </span>
            <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  // Derselbe Radius-Anteil wie beim Chip (10px auf 34px),
                  // nur auf 22px Hoehe heruntergerechnet -- eine Pille
                  // stuende sonst neben lauter eckigen Auswahl-Chips.
                  "inline-flex h-5.5 items-center rounded-[7px] px-2.5 text-[11.5px] font-bold whitespace-nowrap",
                  styles.chip,
                  !isClient && "opacity-0",
                )}
              >
                {expiryLabel(days, item.expiryDate)}
              </span>
              <span className="text-xs leading-snug font-semibold text-muted-foreground">
                {meta}
              </span>
            </span>
          </span>
          <ChevronRight className="size-4.5 shrink-0 text-muted-foreground opacity-35" />
        </button>
      </div>
    </div>
  );
}
