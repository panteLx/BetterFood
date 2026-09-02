"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { clearBatch, readBatch } from "@/lib/review-batch";

/**
 * Ein abgebrochener Prüf-Durchlauf wird verworfen, nicht aufbewahrt -- aber
 * nur, wenn der Nutzer das auch gemeint hat.
 *
 * Der Batch liegt im `sessionStorage` und überlebte damit jeden Wechsel
 * innerhalb desselben Tabs. Wer eine Rechnung einlas und das Prüfen mittendrin
 * verließ, fand die 33 Zeilen Stunden später wieder -- auf `/review`, und über
 * den gemeinsamen Speicher auch in der Scan-Ablage. Das war keine
 * Hilfestellung, sondern eine Überraschung: niemand rechnet damit, dass ein
 * Einkauf von vorhin noch halb offen im Hintergrund liegt.
 *
 * Deshalb gilt: Wer den Prüf-Flow verlässt, hat ihn abgebrochen. Der Beleg
 * muss dann neu eingelesen werden -- das kostet einen Upload und ist ehrlicher
 * als ein Zwischenstand, den man nicht mehr zuordnen kann.
 *
 * ## Warum hier eine Rückfrage steht
 *
 * Der Weg hinaus ist auf dem Telefon fast immer die Zurück-Geste: `/review`
 * blendet die Navigationsleiste aus (bottom-nav.tsx, HIDDEN_PREFIXES), es gibt
 * also nichts anderes zum Antippen als den Haus-Knopf oben links. Der fragt
 * seit jeher nach (review-step.tsx) -- die viel häufigere Wischgeste warf
 * dagegen 34 Belegzeilen weg, ohne ein Wort. Ein Griff zu viel am Rand des
 * Bildschirms kostete den ganzen Einkauf.
 *
 * Abgefangen wird das über einen Wächter-Eintrag in der History: beim Betreten
 * von `/review` legt diese Komponente einen zusätzlichen Eintrag auf denselben
 * Pfad. Die erste Zurück-Geste landet damit wieder auf `/review` statt
 * draußen, und statt hinauszugehen stellt sie die Frage. Sagt der Nutzer "ja",
 * geht es über `history.go(-2)` genau dorthin, wo die Geste geführt hätte --
 * über den Wächter und den echten Eintrag hinweg.
 *
 * `window.history.pushState` ist dafür der von Next vorgesehene Weg: die
 * Aufrufe hängen sich in den Router ein und halten `usePathname` synchron
 * (node_modules/next/dist/docs/01-app/01-getting-started/
 * 04-linking-and-navigating.md, "Native History API").
 *
 * Damit die Rechnung aufgeht, darf der Prüf-Flow selbst keine
 * Zwischeneinträge anlegen -- er navigiert deshalb mit `router.replace`
 * (review-step.tsx). Sonst ließe sich "ein Artikel zurück" nicht von "Flow
 * verlassen" unterscheiden, und die Rückfrage erschiene mitten im Durchlauf.
 *
 * ## Warum im Wurzel-Layout
 *
 * Unter Cache Components hängt Next die verlassene Route nicht aus, sondern
 * versteckt sie per <Activity> (node_modules/next/dist/docs/01-app/02-guides/
 * preserving-ui-state.md). Eine Aufräumfunktion in `review-step.tsx` liefe
 * deshalb auch beim Schritt von `/review/3` nach `/review/4` und löschte den
 * Batch mitten im Durchlauf. Hier oben übersteht der Wächter-Eintrag außerdem
 * jeden Schrittwechsel: die Komponente wird dabei nicht neu montiert.
 *
 * Nur das Verlassen von `/review` löst aus, nicht das Verlassen von `/scan`:
 * die Ablage dort zeigt, was der Nutzer selbst gerade gescannt hat, und der
 * Weg `/scan` -> `/scan-ean` -> zurück ist ein vorgesehener Umweg mitten im
 * Sammeln.
 */
const REVIEW_PREFIX = "/review";

export function ReviewBatchGuard() {
  const pathname = usePathname();
  // Der vorige Pfad steht in einem Ref und nicht im State: er beeinflusst
  // nichts, was gerendert wird, und ein Rendern je Navigation mehr wäre
  // genau das, was diese Komponente sonst vermeidet.
  const previous = useRef<string | null>(null);
  /** Steht ein Wächter-Eintrag für den laufenden Prüf-Durchlauf? */
  const guarded = useRef(false);
  /** Der Schritt, auf dem der Nutzer war, als die Geste kam. */
  const lastReviewPath = useRef<string | null>(null);
  /** Unsere eigene Rückfahrt darf die Rückfrage nicht erneut auslösen. */
  const leaving = useRef(false);
  // Die Zahl wird beim Öffnen festgehalten und nicht laufend abonniert: diese
  // Komponente hängt im Wurzel-Layout und soll nicht bei jeder Änderung des
  // Batches die ganze App neu rendern. Sie steht neben dem Offen-Zustand und
  // nicht darin, damit der Text während der Schließ-Animation nicht auf "0
  // Artikel" umspringt.
  const [asking, setAsking] = useState(false);
  const [count, setCount] = useState(0);

  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    const inside = pathname.startsWith(REVIEW_PREFIX);

    if (inside) {
      lastReviewPath.current = pathname;
      if (!guarded.current) {
        guarded.current = true;
        // Derselbe Pfad, nur ein Eintrag mehr: der Nutzer sieht davon nichts,
        // die erste Zurück-Geste hat aber etwas zum Verbrauchen.
        window.history.pushState(null, "", pathname);
      }
      return;
    }

    guarded.current = false;
    leaving.current = false;
    if (from === null || !from.startsWith(REVIEW_PREFIX)) return;
    // Der Abschluss räumt selbst auf, bevor er nach /saved weiterleitet --
    // die Abfrage hält die Abonnenten des Speichers dann in Ruhe.
    if (readBatch().length > 0) clearBatch();
  }, [pathname]);

  useEffect(() => {
    function onPopState() {
      if (leaving.current || !guarded.current) return;
      // Ohne Batch gibt es nichts zu verlieren -- dann ist die Geste einfach
      // eine Navigation, und eine Rückfrage wäre im Weg.
      if (readBatch().length === 0) return;

      const back = lastReviewPath.current;
      if (!back) return;
      // Den verbrauchten Wächter sofort ersetzen: sonst führt die zweite
      // Geste doch hinaus, während die Frage noch offen auf dem Schirm steht.
      window.history.pushState(null, "", back);
      setCount(readBatch().length);
      setAsking(true);
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  /**
   * Verwerfen heißt: dorthin, wo die Zurück-Geste hingeführt hätte.
   *
   * Zwei Schritte, weil zwei Einträge dazwischenliegen -- der Wächter von
   * eben und der echte Eintrag des Prüf-Flows. Wurde `/review` direkt
   * geöffnet (Deep Link, ohne Vorgeschichte im Tab), tut `go` nichts; dann
   * bleibt der jetzt leere Prüf-Flow stehen und zeigt seinen "Nichts zu
   * prüfen"-Zustand samt Weg zum Scanner.
   */
  function discard() {
    leaving.current = true;
    clearBatch();
    window.history.go(-2);
  }

  return (
    <ConfirmDialog
      open={asking}
      onOpenChange={setAsking}
      icon={TriangleAlert}
      title="Prüfen abbrechen?"
      description={
        <>
          Nichts davon ist gespeichert
          {count === 1
            ? " — der Artikel dieses Durchlaufs wird verworfen"
            : ` — die ${count} Artikel dieses Durchlaufs werden verworfen`}
          . Eine Rechnung müsstest du danach neu einlesen.
        </>
      }
      confirmLabel="Verwerfen"
      onConfirm={discard}
    />
  );
}
