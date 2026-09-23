"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { StepCard, type StepPatch } from "@/components/review-step";
import type { BatchEntry } from "@/lib/review-batch";
import type { Category, Place } from "@/db/schema";

/**
 * Der Prüf-Schritt als Blatt über dem laufenden Kamerabild.
 *
 * Damit kann ein Artikel fertig gemacht werden, während man ihn noch in der
 * Hand hält -- scannen, Datum ablesen, eintragen, nächste Packung. Der Weg
 * dahin ist bewusst kein zweiter Bildschirm: `/scan` zu verlassen hieße, die
 * Kamera zu schließen, und ein Kaltstart je Artikel ist genau das, was der
 * Batch-Scan abgeschafft hat (siehe `scan-screen.tsx`, Pausieren des Decoders).
 *
 * Es ist derselbe `StepCard` wie im Prüf-Flow, nur ohne eigene Kartenfläche.
 * Ein zweites, schmaleres Formular fürs Scannen wäre der Anfang von zwei
 * Wahrheiten darüber, was ein Artikel braucht.
 *
 * Das Blatt liegt in einem Portal und damit außerhalb des `dark`-Wrappers der
 * Kamera-Seite: es trägt das Theme der App, nicht die Dunkelheit des
 * Sucherbilds. Das ist Absicht -- ein Formular ist kein Kamerabild.
 */
export function ScanExpirySheet({
  entry,
  resolving,
  categories,
  places,
  today,
  onClose,
  onDecide,
}: {
  /** Der Artikel, über den entschieden wird -- `null` heißt: Blatt zu. */
  entry: BatchEntry | null;
  /** Laufen Namens- und Einordnungsabfrage für diesen Artikel noch? */
  resolving: boolean;
  categories: Category[];
  places: Place[];
  today: Date;
  onClose: () => void;
  onDecide: (patch: StepPatch, status: "done" | "skipped") => void;
}) {
  /**
   * Was das Blatt zeigt, auch während es zufährt.
   *
   * `entry` wird beim Schließen null, das Blatt braucht seinen Inhalt aber noch
   * für die 400ms der Ausfahrt -- sonst klappt der Text weg und eine leere
   * Fläche rutscht nach unten. Ableitung während des Rendern statt in einem
   * Effekt: `react-hooks/set-state-in-effect` ist scharf gestellt, und dasselbe
   * Muster steht in `review-step.tsx` (`previousSuggestion`).
   */
  const [shown, setShown] = useState(entry);
  if (entry && entry !== shown) setShown(entry);

  return (
    <Sheet
      open={entry !== null}
      onOpenChange={(open) => {
        // Runterwischen heißt "später": der Eintrag bleibt `pending`, liegt
        // weiter in der Ablage und wird am Ende im Prüf-Flow gefragt. Deshalb
        // braucht dieser Ausweg keine Rückfrage -- er verliert nichts.
        if (!open) onClose();
      }}
      title={shown?.name || "Artikel eintragen"}
      hideTitle
    >
      {shown &&
        (resolving ? (
          /* Das Blatt geht sofort auf, obwohl Name und Einordnung noch
             unterwegs sind: ein Scan, der eine halbe Sekunde nichts tut, sieht
             aus wie einer, der nicht gezählt hat. `StepCard` darf aber erst
             danach montieren -- es liest `entry` genau einmal in seinen
             Entwurf, und eine später eintreffende Antwort wäre für immer
             verworfen (derselbe Fehler, den `/confirm` mit `key={barcode}`
             schon einmal hatte). */
          <div className="flex items-center gap-3 px-1.5 pb-4">
            <span className="size-11 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="font-mono text-[13px] font-bold text-muted-foreground">
                {shown.barcode}
              </span>
              <span className="text-[12.5px] font-semibold text-faint">
                Wird nachgeschlagen …
              </span>
            </div>
          </div>
        ) : (
          <StepCard
            // Derselbe Schlüssel wie im Prüf-Flow: der Entwurf gehört zu genau
            // diesem Artikel und darf den nächsten nicht vorbelegen.
            key={shown.id}
            entry={shown}
            categories={categories}
            places={places}
            today={today}
            embedded
            onCommit={(patch) => onDecide(patch, "done")}
            onSkip={(patch) => onDecide(patch, "skipped")}
          />
        ))}
    </Sheet>
  );
}
