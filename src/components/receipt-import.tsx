"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Receipt, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SubPageHeader } from "@/components/sub-page-header";
import { EmptyState } from "@/components/empty-state";
import { SectionLabel } from "@/components/section-label";
import { formatMedium, toDateInputValue } from "@/lib/expiry";
import { createEntry, readBatch, writeBatch } from "@/lib/review-batch";
import {
  IGNORE_LABELS,
  type ReceiptDraft,
  type ReceiptDraftLine,
} from "@/lib/receipt/types";
import { cn } from "@/lib/utils";

/**
 * Einen ganzen Einkauf auf einmal erfassen: PDF-Rechnung hochladen, die
 * erkannten Zeilen ansehen, prüfen.
 *
 * Der teuerste Moment der App ist der Abend nach dem Wocheneinkauf --
 * dreißig Artikel einzeln zu scannen macht niemand zweimal. Lieferdienste
 * schicken ohnehin eine PDF mit Textebene, und was darin steht (Name, Menge,
 * Lieferdatum), reicht dem Formular vollständig; die fehlende EAN kostet
 * nichts, weil die Wiedererkennung ohnehin über den Namen läuft.
 *
 * ## Warum hier kein Prüf-Bildschirm mehr steht
 *
 * Bis Runde 8 hatte der Rechnungsimport einen eigenen: vier Abschnitte,
 * Auswahlmodus, Sammel-Sheets, Datums-Warteschlange, gut tausend Zeilen. Er
 * war gut, aber er war der zweite -- der Batch-Scan hatte inzwischen seinen
 * eigenen unter `/review`, mit anderer Bedienung für dieselbe Aufgabe. Zwei
 * Prüf-Flows nebeneinander heißt: jede künftige Verbesserung zweimal bauen
 * oder eine Hälfte veralten lassen.
 *
 * Geblieben ist deshalb genau das, was den Beleg vom Scan unterscheidet: das
 * Hochladen, die Übersicht über das, was der Parser gefunden hat, und der
 * Hinweis auf die Zeilen, die er bewusst weggelassen hat. Alles danach ist
 * `/review`.
 *
 * ## Warum die Übersicht nichts bedienen lässt
 *
 * Sie beantwortet eine einzige Frage, und zwar die, die man mit dem Papier
 * in der Hand stellt: "ist alles da?" Ein Parser übersieht Zeilen, und wer
 * das erst im achten Schritt des Prüf-Flows merkt, hat sieben Entscheidungen
 * umsonst getroffen. Bedienelemente hier wären der Anfang eines zweiten
 * Prüf-Bildschirms -- genau dessen, den diese Fassung abgeschafft hat.
 */
export function ReceiptImport() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<ReceiptDraft | null>(null);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Der Verdacht, dass eine Zeile gar kein Lebensmittel ist: 19 %
   * Mehrwertsteuer an einem Produkt, das diese Liste noch nicht kennt.
   *
   * Der Steuersatz wählt nichts vor -- 19 % sind meistens Drogerie oder
   * Haushalt, aber eben auch jede Limonade, und ein vergessener Artikel
   * kostet mehr als ein abzuwählender. Er stellt nur eine Frage, und auch
   * das nur, solange die Liste das Produkt nicht kennt: ab dem ersten
   * Import ist sie beantwortet.
   */
  function looksInedible(line: ReceiptDraftLine): boolean {
    return !line.known && line.vatClass === "A";
  }

  async function readFile(file: File) {
    setError(null);
    setReading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/receipt/parse", { method: "POST", body });
      const payload = (await res.json()) as ReceiptDraft & { error?: string };

      if (!res.ok) {
        setError(payload.error ?? "Die Rechnung konnte nicht gelesen werden.");
        return;
      }

      setDraft(payload);
    } catch {
      setError("Die Rechnung konnte nicht gelesen werden.");
    } finally {
      setReading(false);
      // Damit dieselbe Datei nach einem Fehler erneut gewaehlt werden kann --
      // ein unveraenderter Wert loest kein change-Ereignis aus.
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  /**
   * Übergibt den Beleg an den Prüf-Flow.
   *
   * Angehängt und nicht ersetzt: wer erst fünf Artikel gescannt hat und dann
   * die Rechnung dazulegt, meint beides. Der Entwurf wird danach verworfen,
   * damit dieselbe Übersicht nicht ein zweites Mal abgeschickt werden kann --
   * Belegzeilen haben keinen Barcode, `mergeEntry` kann sie also nicht
   * zusammenfassen, und ein doppelt übergebener Beleg stünde als doppelte
   * Menge im Vorrat.
   */
  function handOver(receipt: ReceiptDraft) {
    // Das Bezugsdatum als Tag, nicht als Zeitstempel: der Prüf-Flow rechnet
    // die Haltbarkeit ab dem Liefertag des Belegs und nicht ab heute. Eine
    // Rechnung, die erst zwei Tage später eingelesen wird, ergäbe sonst
    // durchweg zwei Tage zu lange Haltbarkeiten.
    const purchasedAt = toDateInputValue(new Date(receipt.referenceDate));

    const entries = receipt.lines.map((line) =>
      createEntry({
        source: "receipt",
        name: line.name,
        // Die Schreibweise vom Papier, aus der `POST /api/items/import` den
        // Alias in `product_knowledge` lernt.
        rawName: line.rawName,
        note: line.note,
        quantity: line.quantity,
        sourceQuantity: line.quantity,
        known: line.known,
        category: line.category,
        placeId: line.placeId,
        purchasedAt,
        // Nur der Hinweis, nicht die Entscheidung: `status` bleibt bei der
        // Vorgabe "pending", und der Prüf-Flow zeigt den Verdacht im Schritt.
        // Der erste Anlauf ließ die Zeile bereits übersprungen herein --
        // dann steht sie am Ende unter 34 Namen in der Übersprungen-Liste,
        // und der Testlauf verlor auf genau diesem Weg einen Energydrink,
        // der 19 % trägt und trotzdem ein Lebensmittel ist.
        foodDoubt: looksInedible(line),
      }),
    );

    const batch = [...readBatch(), ...entries];
    writeBatch(batch);
    setDraft(null);

    // Auf den ersten offenen Eintrag und nicht stur auf /review/0: liegt
    // schon ein durchgeprüfter Scan-Batch davor, begänne der Flow sonst bei
    // einem Artikel, über den längst entschieden ist.
    const first = batch.findIndex((entry) => entry.status === "pending");
    router.push(`/review/${first >= 0 ? first : batch.length}`);
  }

  if (!draft) {
    return (
      <>
        <SubPageHeader title="Rechnung einlesen" />
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void readFile(file);
          }}
        />
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const file = event.dataTransfer.files?.[0];
            if (file) void readFile(file);
          }}
          className={cn(
            "rounded-3xl border border-dashed transition-colors",
            dragging
              ? "border-primary bg-primary-tint"
              : "border-border bg-card",
          )}
        >
          <EmptyState
            icon={reading ? Loader2 : Receipt}
            tone="primary"
            className={reading ? "[&_svg]:animate-spin" : undefined}
            title={reading ? "Rechnung wird gelesen …" : "Rechnung einlesen"}
            body="Nur PDF-Rechnungen von Lieferdiensten wie REWE, Flink, Picnic oder anderen werden unterstützt.
            Ein Foto oder eingescannter Kassenbon funktioniert noch nicht!"
            action={
              <Button
                className="mt-1 h-12 rounded-lg px-6"
                disabled={reading}
                onClick={() => fileInputRef.current?.click()}
              >
                PDF auswählen
              </Button>
            }
          />
        </div>

        {error && (
          <p className="rounded-[18px] border border-danger/30 bg-danger-tint px-4 py-3 text-[13px] leading-relaxed font-semibold text-danger">
            {error}
          </p>
        )}
      </>
    );
  }

  const doubtful = draft.lines.filter(looksInedible).length;

  return (
    <>
      <SubPageHeader title="Das steht auf der Rechnung" />

      <div className="-mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium text-muted-foreground">
        {draft.retailer && (
          <span className="font-bold text-foreground">{draft.retailer}</span>
        )}
        <span>Einkauf vom {formatMedium(new Date(draft.referenceDate))}</span>
        <span>
          · {draft.lines.length}{" "}
          {draft.lines.length === 1 ? "Position" : "Positionen"}
        </span>
      </div>

      {draft.ignored.length > 0 && (
        // Nicht stillschweigend schlucken: wer 38 Zeilen auf dem Papier zaehlt
        // und 34 auf dem Schirm, sucht sonst nach dem Fehler.
        <p className="text-[12.5px] leading-relaxed font-medium text-faint">
          {draft.ignored.length} Zeile{draft.ignored.length === 1 ? "" : "n"}{" "}
          übersprungen:{" "}
          {draft.ignored
            .map((entry) => `${entry.rawName} (${IGNORE_LABELS[entry.reason]})`)
            .join(", ")}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <SectionLabel title="Gefunden" count={draft.lines.length} />
        {draft.lines.map((line) => {
          const doubt = looksInedible(line);
          return (
            <div
              key={line.id}
              className="flex items-start gap-2.5 rounded-[16px] border border-border bg-card py-2.5 pr-3.5 pl-3.5"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] leading-snug font-bold">
                  {line.name}
                </span>
                {/* Die Schreibweise vom Papier, sobald sie abweicht: der
                    Abgleich passiert gegen die Rechnung, und wer aus "ja!
                    Mozzarella 125g" einmal "Mozzarella" gemacht hat, findet
                    seine Zeile sonst nicht wieder. */}
                {line.rawName !== line.name && (
                  <span className="mt-0.5 block truncate text-[11.5px] leading-tight font-semibold text-faint">
                    laut Beleg: {line.rawName}
                  </span>
                )}
                {line.note && (
                  <span className="mt-0.5 block text-[11.5px] leading-tight font-semibold text-faint">
                    {line.note}
                  </span>
                )}
                {doubt && (
                  <span className="mt-1 flex items-center gap-1 text-[11.5px] leading-tight font-semibold text-warning">
                    <TriangleAlert className="size-3 shrink-0" strokeWidth={2.4} />
                    Vermutlich kein Lebensmittel
                  </span>
                )}
              </span>
              <span className="shrink-0 font-mono text-[12.5px] font-semibold text-faint">
                {line.quantity}×
              </span>
            </div>
          );
        })}
      </div>

      {/* Klebend und nicht am Ende der Liste: 34 Positionen sind gut zwei
          Bildschirmhöhen, und der Knopf wäre am unteren Ende von zwei
          Bildschirmhöhen Text. Die Übersicht ist eine Rückversicherung, kein
          Tor -- wer nicht abgleichen will, soll nicht erst dorthin scrollen
          müssen. Auf /receipt steht keine Navigationsleiste im Weg
          (bottom-nav-gate.tsx zeigt sie nur mit Sitzung, und die Seite
          gehört nicht zu ihren fünf Zielen), das `-mx-5` holt die Leiste aus
          dem Seitenrand der Route über die volle Breite. */}
      <div className="sticky bottom-0 -mx-5 mt-auto flex flex-col gap-2 border-t border-border bg-background/90 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur-[20px]">
        {doubtful > 0 && (
          <p className="text-[12px] leading-relaxed font-medium text-faint">
            {doubtful === 1
              ? "Eine Zeile trägt 19 % Mehrwertsteuer und ist als „vermutlich kein Lebensmittel“ markiert"
              : `${doubtful} Zeilen tragen 19 % Mehrwertsteuer und sind als „vermutlich kein Lebensmittel“ markiert`}{" "}
            — abgefragt werden sie trotzdem, der Hinweis steht dann im Schritt
            dabei.
          </p>
        )}
        <Button
          className="h-13 rounded-lg text-[15px]"
          onClick={() => handOver(draft)}
        >
          <Check className="size-4.5" strokeWidth={2.4} />
          {draft.lines.length === 1
            ? "1 Artikel prüfen"
            : `${draft.lines.length} Artikel prüfen`}
        </Button>
      </div>
    </>
  );
}
