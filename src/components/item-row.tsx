"use client";

import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  STATUS_CLASSES,
  daysUntil,
  expiryDayBlock,
  expiryStatus,
} from "@/lib/expiry";
import { REVEAL_DISTANCE, useSwipeActions } from "@/lib/use-swipe-actions";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";
import type { Item } from "@/db/schema";

/**
 * Eine Zeile im Vorrat.
 *
 * Gegenüber der bisherigen Karte trägt die Zeile die Restlaufzeit als Zahl
 * links statt als Pille in der zweiten Zeile. Das ist der ganze Unterschied,
 * und er ist der Grund für den Umbau: die Pille stand mitten im Fließtext und
 * musste in jeder Zeile neu gelesen werden ("In 2 Tagen", "Heute", "Vor 3
 * Tagen abgelaufen"). Untereinander an einer festen Kante werden aus
 * denselben Angaben Ziffern in einer Spalte -- die Reihenfolge liest sich
 * dann ohne einen einzigen Satz. Die Zeile wird dadurch von 72,75 px auf
 * 60 px flacher, es passt also auch mehr davon auf den Bildschirm.
 *
 * Die beiden häufigsten Aktionen liegen weiterhin in der Wischgeste: nach
 * rechts heißt aufgebraucht, nach links weggeworfen. Die Geste ist bewusst
 * NICHT der einzige Weg -- das Antippen führt auf die Detailseite, wo dieselben
 * Aktionen als richtige Buttons stehen. Eine Wischgeste ist per Tastatur und
 * mit Screenreader nicht bedienbar, und ein Vorrat, den man nur mit dem
 * Finger abhaken kann, wäre für einen Teil der Nutzer gar nicht bedienbar.
 */
export function ItemRow({
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

  // Die Statusfarbe hängt am heutigen Datum -- bis zur Hydration bleibt sie
  // deshalb neutral, statt den Prerender der Route zu sprengen.
  const isClient = useIsClient();
  const days = isClient ? daysUntil(item.expiryDate) : 0;
  const styles = STATUS_CLASSES[expiryStatus(days)];
  const block = expiryDayBlock(days);

  return (
    <div
      // overflow-x-clip, nicht overflow-hidden: geschnitten werden muss nur
      // waagerecht, damit die weggewischte Zeile nicht über den Seitenrand
      // läuft. Ein senkrechter Clip hat hier nichts zu tun und schnitt bei
      // bruchteiliger Zeilenhöhe die Unterkante an.
      className={cn(
        "relative overflow-x-clip rounded-[15px] transition-colors",
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
        // Nur während der Geste ein Transform. Ein Element mit transform wird
        // von den Browsern nicht mehr auf ganze Gerätepixel gerundet, und die
        // 1px-Unterkante verblasste dabei bis zur Unsichtbarkeit. Auf
        // translateX(0px) zu verzichten kostet nichts: die Rückfeder-Animation
        // läuft weiterhin, weil CSS gegen "none" wie gegen die Identität
        // interpoliert.
        style={
          offset === 0 ? undefined : { transform: `translateX(${offset}px)` }
        }
        className={cn(
          "relative flex h-15 touch-pan-y items-center rounded-[15px] border border-border bg-card shadow-raise select-none",
          dragging ? "transition-none" : "transition-transform duration-200",
        )}
      >
        <button
          type="button"
          onClick={() => {
            // Nach einer Wischgeste darf das abschließende Click-Event die
            // Detailseite nicht mit öffnen.
            if (wasSwipe()) return;
            router.push(`/item/${item.id}`);
          }}
          className="flex h-full min-w-0 flex-1 items-center gap-[11px] rounded-[15px] pr-3 pl-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            className={cn(
              "flex size-11 shrink-0 flex-col items-center justify-center overflow-hidden rounded-[12px]",
              styles.tint,
              styles.text,
              // Vor der Hydration steht dort rechnerisch "0 Tage" -- das wäre
              // eine Behauptung über jeden Artikel. Erst der Client kennt den
              // heutigen Tag.
              !isClient && "opacity-0",
            )}
          >
            <span
              className={cn(
                "leading-none font-extrabold tabular-nums",
                // 16px trägt drei Zeichen im 44px-Block. Ab dem vierten -- ein
                // Vorrat mit Haltbarkeit über Jahre, oder ein Artikel, der
                // seit über tausend Tagen abgelaufen im Archiv hängt --
                // läuft die Zahl sonst über die Kachel hinaus: "−1200" misst
                // bei 16px 48,3px. Eine Stufe kleiner passt bis sechs Zeichen.
                block.value.length > 3 ? "text-[13px]" : "text-[16px]",
              )}
            >
              {block.value}
            </span>
            <span className="mt-0.5 text-[8.5px] leading-none font-bold tracking-[0.05em] uppercase">
              {block.label}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14.5px] leading-tight font-bold">
              {item.name}
              {item.quantity > 1 && (
                <span className="ml-2 text-muted-foreground">
                  ×{item.quantity}
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-[11.5px] leading-tight font-semibold text-faint">
              {meta}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground opacity-35" />
        </button>
      </div>
    </div>
  );
}
