"use client";

import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import {
  STATUS_CLASSES,
  expiryDayBlock,
  expiryStatus,
  type ExpiryStatus,
} from "@/lib/expiry";
import { REVEAL_DISTANCE, useSwipeActions } from "@/lib/use-swipe-actions";
import { cn } from "@/lib/utils";
import type { Item } from "@/db/schema";

/**
 * Die Fläche der Zeile selbst, nach Ablauf-Zustand -- getrennt von
 * STATUS_CLASSES.tint, weil dessen Feld die Fläche des Tage-Blocks meint
 * (auch "frisch" bekommt dort --primary-tint). Die Zeile ist nur bei "bald"
 * und "abgelaufen" getönt; frisch und "später" bleiben --card mit Schatten,
 * sonst sähe ein gut gefüllter Vorrat komplett grün getönt aus.
 */
const ROW_SURFACE: Record<ExpiryStatus, string> = {
  expired: "bg-danger-tint",
  soon: "bg-warning-tint",
  fresh: "bg-card shadow-row",
};

/**
 * Der Abhaken-Knopf: im Hellen weiß mit einem zum Zustand getönten Schatten
 * auf den getönten Zeilen (siehe --shadow-check-danger/-warning), im
 * Dunkelmodus stattdessen --primary-tint ohne Schatten -- ein Schatten löst
 * dort kaum eine Fläche vom Grund, eine grün getönte Fläche schon. Auf einer
 * frischen (--card-)Zeile bleibt der Knopf in beiden Themes --surface-2,
 * weil er neben --card sonst gar keine eigene Kante hätte.
 */
const CHECK_SURFACE: Record<ExpiryStatus, string> = {
  // Kein dark:shadow-none: --shadow-check-tint-danger/-warning stehen unter
  // .dark schon auf none, der Schatten faellt dort also ohne Variante weg.
  expired: "bg-card shadow-check-danger dark:bg-primary-tint",
  soon: "bg-card shadow-check-warning dark:bg-primary-tint",
  fresh: "bg-surface-2",
};

/**
 * Eine Zeile im Vorrat -- das zentrale Element der ganzen App.
 *
 * Die Restlaufzeit steht als Zahl im Tage-Block links, nicht als Pille im
 * Fließtext ("In 2 Tagen", "Heute", "Vor 3 Tagen abgelaufen"). Untereinander
 * an einer festen Kante werden aus denselben Angaben Ziffern in einer
 * Spalte -- die Reihenfolge liest sich dann ohne einen einzigen Satz.
 *
 * Die beiden häufigsten Aktionen liegen weiterhin in der Wischgeste: nach
 * rechts heißt aufgebraucht, nach links weggeworfen. Die Geste ist bewusst
 * NICHT der einzige Weg -- der Rundknopf rechts hakt direkt ab, und das
 * Antippen der übrigen Zeile führt auf die Detailseite, wo dieselben
 * Aktionen als richtige Buttons stehen. Eine Wischgeste ist per Tastatur und
 * mit Screenreader nicht bedienbar, und ein Vorrat, den man nur mit dem
 * Finger abhaken kann, wäre für einen Teil der Nutzer gar nicht bedienbar.
 */
export function ItemRow({
  item,
  days,
  meta,
  onConsume,
  onDiscard,
  disabled = false,
  restless = false,
}: {
  item: Item;
  /**
   * Restlaufzeit in Tagen, gegen den Stichtag des Aufrufers gerechnet.
   *
   * Als Prop und nicht hier: beide Aufrufer brauchen dieselbe Zahl ohnehin
   * schon, um zu sortieren und zu gruppieren, und beide zeigen erst nach der
   * Hydration Zeilen an (vorher steht dort ein Platzhalter). Rechnete die
   * Zeile noch einmal selbst, hinge sie an ihrer eigenen Uhr -- über
   * Mitternacht hinweg stünde unter der Überschrift "Heute" eine Zeile, die
   * sich für "Morgen" hält.
   */
  days: number;
  /** Zweitzeile: je nach Gruppierung die Kategorie oder der Ort. */
  meta: string;
  onConsume: () => void;
  onDiscard: () => void;
  disabled?: boolean;
  /**
   * Die oberste abgelaufene Zeile wackelt dezent (`animate-tilt`) -- ein
   * Hinweis, kein Alarm für jede Zeile. Der Aufrufer setzt das Flag für
   * Index 0 des Abgelaufen-Abschnitts, die Zeile selbst kennt ihre Position
   * in der Liste nicht.
   */
  restless?: boolean;
}) {
  const router = useRouter();
  const { offset, dragging, wasSwipe, handlers } = useSwipeActions({
    onSwipeRight: onConsume,
    onSwipeLeft: onDiscard,
    disabled,
  });

  const status = expiryStatus(days);
  const styles = STATUS_CLASSES[status];
  const block = expiryDayBlock(days);
  // 21px trägt zwei Zeichen im 54px-Block. Ab drei Zeichen -- ein Artikel,
  // dessen Haltbarkeit über 99 Tage hinausreicht, oder einer, der seit über
  // tausend Tagen abgelaufen im Archiv hängt -- läuft die Zahl sonst über
  // die Kachel hinaus.
  const digits = block.value.length;
  const numberSize = digits <= 2 ? "text-[21px]" : digits === 3 ? "text-[19px]" : "text-[17px]";

  return (
    <div
      // overflow-x-clip, nicht overflow-hidden: geschnitten werden muss nur
      // waagerecht, damit die weggewischte Zeile nicht über den Seitenrand
      // läuft. Ein senkrechter Clip hat hier nichts zu tun und schnitt bei
      // bruchteiliger Zeilenhöhe die Unterkante an.
      className={cn(
        "relative overflow-x-clip rounded-[24px] transition-colors",
        offset > 0 ? "bg-primary-tint" : offset < 0 ? "bg-danger-tint" : undefined,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-between pr-3.5 pl-[13px] font-heading text-[14px] font-bold"
      >
        <span
          className={cn(
            "text-primary-deep transition-opacity",
            offset > REVEAL_DISTANCE ? "opacity-100" : "opacity-0",
          )}
        >
          🎉 Aufgebraucht
        </span>
        <span
          className={cn(
            "text-danger-ink transition-opacity",
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
          "relative flex touch-pan-y items-center gap-3 rounded-[24px] py-[9px] pr-[14px] pl-[9px] select-none",
          ROW_SURFACE[status],
          dragging ? "transition-none" : "transition-transform duration-200",
          // Nur die oberste abgelaufene Zeile bekommt das Wackeln -- läuft
          // die Rückfeder-Transition parallel, würde animate-tilt vom
          // eigenen transform-Reset unterbrochen. Beides passiert hier nie
          // gleichzeitig: das Wackeln steht nur bei offset === 0 an.
          restless && offset === 0 && "animate-tilt",
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
          className="flex min-w-0 flex-1 items-center gap-3 rounded-[24px] text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span
            className={cn(
              "flex size-[54px] shrink-0 flex-col items-center justify-center rounded-[19px]",
              styles.solid,
            )}
          >
            <span className={cn("font-heading leading-none font-bold tabular-nums", numberSize)}>
              {block.value}
            </span>
            <span className="mt-px text-[9px] leading-none font-extrabold tracking-[0.08em] uppercase">
              {block.label}
            </span>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-heading text-[16px] leading-tight font-bold">
              {item.name}
              {item.quantity > 1 && (
                <span className={cn("ml-2 font-mono text-[12.5px] font-normal", styles.meta)}>
                  ×{item.quantity}
                </span>
              )}
            </span>
            <span className={cn("mt-0.5 block truncate text-[11.5px] leading-tight font-semibold", styles.meta)}>
              {meta}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={onConsume}
          aria-label={`${item.name} abhaken`}
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full text-primary-deep outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            CHECK_SURFACE[status],
          )}
        >
          <Check className="size-[18px]" strokeWidth={2.8} />
        </button>
      </div>
    </div>
  );
}
