"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { clearBatch, readBatch } from "@/lib/review-batch";

/**
 * Ein abgebrochener Prüf-Durchlauf wird verworfen, nicht aufbewahrt.
 *
 * Der Batch liegt im `sessionStorage` und überlebte damit jeden Wechsel
 * innerhalb desselben Tabs. Wer eine Rechnung einlas und das Prüfen mittendrin
 * verließ, fand die 33 Zeilen Stunden später wieder -- auf `/review`, und über
 * den gemeinsamen Speicher auch in der Scan-Ablage. Das war keine
 * Hilfestellung, sondern eine Überraschung: niemand rechnet damit, dass ein
 * Einkauf von vorhin noch halb offen im Hintergrund liegt.
 *
 * Deshalb gilt jetzt: Wer den Prüf-Flow verlässt, hat ihn abgebrochen. Der
 * Beleg muss dann neu eingelesen werden -- das kostet einen Upload und ist
 * ehrlicher als ein Zwischenstand, den man nicht mehr zuordnen kann.
 *
 * Nur das Verlassen von `/review` löst aus, nicht das Verlassen von `/scan`:
 * die Ablage dort zeigt, was der Nutzer selbst gerade gescannt hat, und der
 * Weg `/scan` -> `/scan-ean` -> zurück ist ein vorgesehener Umweg mitten im
 * Sammeln. Zwischen `/review/3` und `/review/4` liegt ebenfalls eine
 * Navigation, aber keine Grenze.
 *
 * Im Layout und nicht in `review-step.tsx`: unter Cache Components hängt Next
 * die verlassene Route nicht aus, sondern versteckt sie per <Activity>
 * (node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md). Eine
 * Aufräumfunktion dort liefe deshalb auch beim Schritt von `/review/3` nach
 * `/review/4` und löschte den Batch mitten im Durchlauf.
 */
const REVIEW_PREFIX = "/review";

export function ReviewBatchGuard() {
  const pathname = usePathname();
  // Der vorige Pfad steht in einem Ref und nicht im State: er beeinflusst
  // nichts, was gerendert wird, und ein Rendern je Navigation mehr wäre
  // genau das, was diese Komponente sonst vermeidet -- sie gibt nichts aus.
  const previous = useRef<string | null>(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    if (from === null || !from.startsWith(REVIEW_PREFIX)) return;
    if (pathname.startsWith(REVIEW_PREFIX)) return;
    // Der Abschluss räumt selbst auf, bevor er nach /saved weiterleitet --
    // die Abfrage hält die Abonnenten des Speichers dann in Ruhe.
    if (readBatch().length > 0) clearBatch();
  }, [pathname]);

  return null;
}
