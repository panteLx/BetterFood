"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarClock, Flashlight, FlashlightOff, SwitchCamera, X } from "lucide-react";
import { toast } from "sonner";
import type { StepPatch } from "@/components/review-step";
import { ScanExpirySheet } from "@/components/scan-expiry-sheet";
import { buttonVariants } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { commitBatch } from "@/lib/batch-commit";
import { formatShort, fromDateInputValue, startOfDay } from "@/lib/expiry";
import {
  clearBatch,
  createEntry,
  firstPendingIndex,
  mergeEntry,
  readBatch,
  updateBatch,
  useBatch,
  type BatchEntry,
} from "@/lib/review-batch";
import { setAutoExpiry, setScanCamera, useAutoExpiry, useScanCamera } from "@/lib/scan-prefs";
import { useBarcodeScanner } from "@/lib/use-barcode-scanner";
import { cn } from "@/lib/utils";
import type { Category, Place } from "@/db/schema";

/**
 * Der Zustand einer Zeile im Ablagefach, als eine Entscheidung statt zweier.
 *
 * Farbe und Wort standen bis zum Frischling-Umbau als zwei gleichlaufende
 * Ternaerketten nebeneinander -- ein neuer Zustand haette an beiden Stellen
 * in derselben Reihenfolge nachgetragen werden muessen.
 *
 * #7ce8a8 ist die helle --primary-inv-Variante aus dem Hellmodus: der
 * erzwungene dark-Wrapper zieht sonst den dunklen .dark-Wert (#1a7039), der
 * fuer den invertierten Toast gedacht ist, nicht fuer dieses immer-dunkle
 * Kamerabild.
 */
type TrayStatus =
  | "done"
  | "skipped"
  | "recognized"
  | "pending"
  | "known"
  | "new";
const TRAY_STATUS: Record<TrayStatus, { className: string; label: string }> = {
  // "fertig" und "gerade erkannt" teilen den Ton: beides sind gute Nachrichten,
  // und der Unterschied steht im Wort. Das Datum haengt bei "fertig" daneben --
  // ohne es waere nicht zu sehen, WAS entschieden wurde, und genau davon haengt
  // ab, ob der Knopf unten "pruefen" oder "uebernehmen" sagt.
  done: { className: "text-[#7ce8a8]", label: "fertig" },
  skipped: { className: "text-white/35", label: "verworfen" },
  recognized: { className: "text-[#7ce8a8]", label: "gerade erkannt" },
  pending: { className: "text-white/35", label: "…" },
  known: { className: "text-white/60", label: "bekannt" },
  new: { className: "text-warning", label: "neu" },
};

export function ScanScreen({
  categories,
  places,
}: {
  categories: Category[];
  places: Place[];
}) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const trayRef = useRef<HTMLUListElement>(null);

  // Der Batch liegt nicht im State dieses Screens, sondern in einem Speicher
  // ausserhalb von React (siehe lib/review-batch.ts): /scan bleibt unter Cache
  // Components per <Activity> am Leben, eine Kopie im State zeigte nach der
  // Rueckkehr aus dem Pruef-Flow also noch den Stand von vor der Pruefung.
  const batch = useBatch();
  // Der Prüf-Batch ist geteilt: der Rechnungsimport schreibt in denselben
  // Speicher, damit Scan und Beleg in einem Durchlauf geprueft werden. Die
  // Ablage hier zeigt trotzdem nur, was die Kamera gelesen hat -- eine
  // unfertige Rechnung stand sonst mit 33 Zeilen unter "Erfasst", also als
  // waeren das gerade erkannte Barcodes. Belegzeilen haben gar keinen.
  const scanned = batch.filter((entry) => entry.source === "scan");
  const fromReceipt = batch.length - scanned.length;
  // Zeilen, deren Abfrage noch laeuft. Bewusst nicht im Batch selbst: das ist
  // Anzeigezustand dieses Screens und geht den Pruef-Flow nichts an.
  const [resolving, setResolving] = useState<string[]>([]);
  const [lastTouchedId, setLastTouchedId] = useState<string | null>(null);

  // Der Schalter entscheidet nur, ob das MHD-Blatt von selbst aufgeht --
  // angetippt werden kann eine Ablage-Zeile immer.
  const autoExpiry = useAutoExpiry();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  /**
   * Der Stichtag, an dem die Richtwerte hängen.
   *
   * Erst beim Öffnen gesetzt und nicht im Render: `new Date()` während des
   * Prerender bricht unter `cacheComponents` die Route ab (derselbe Grund,
   * warum `review-step.tsx` hinter `useIsClient` wartet).
   */
  const [today, setToday] = useState<Date | null>(null);

  const activeEntry = batch.find((entry) => entry.id === activeId) ?? null;
  const pendingIndex = firstPendingIndex(batch);

  // An open sheet must not be left behind when <Activity> hides the screen: it would come back
  // over the camera on the next visit, and the scanner stays paused while it is open.
  useEffect(() => () => setActiveId(null), []);

  function openSheet(id: string) {
    setToday(startOfDay(new Date()));
    setActiveId(id);
  }

  /** Dieselbe Projektion wie im Prüf-Flow (`applyAndAdvance`), nur ohne Route. */
  function decideActive(patch: StepPatch, status: "done" | "skipped") {
    const id = activeId;
    if (!id) return;
    const change =
      status === "done"
        ? { ...patch, status }
        : { ...patch, status, expiryDate: null };
    updateBatch((entries) =>
      entries.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)),
    );
    setActiveId(null);
  }

  /**
   * Der Abschluss von hier aus -- für den Fall, dass im Blatt schon alles
   * entschieden wurde und der Prüf-Flow nichts mehr zu fragen hätte.
   *
   * `committing` pausiert den Scanner: ein Code, der während des Imports gelesen
   * wird, läge nicht im abgeschickten Payload, und das clearBatch() danach
   * löschte ihn still.
   */
  async function handleCommit() {
    // Frisch aus dem Speicher: zwischen dem Render, der diesen Knopf gezeichnet
    // hat, und dem Antippen kann ein Treffer liegen.
    const current = readBatch();
    const stillOpen = firstPendingIndex(current);
    if (stillOpen >= 0) {
      router.push(`/review/${stillOpen}`);
      return;
    }

    setCommitting(true);
    try {
      const outcome = await commitBatch(current);
      clearBatch();
      if (!outcome.wrote) {
        router.replace("/");
        return;
      }
      // Die Vorratsseiten sind serverseitig gerendert und müssen den Zuwachs
      // sehen, sobald der Nutzer hinüberwechselt.
      router.refresh();
      router.replace(
        `/saved?name=${encodeURIComponent(outcome.summary)}&method=${outcome.method}`,
      );
    } catch (caught) {
      toast.error(
        caught instanceof Error ? caught.message : "Der Import ist fehlgeschlagen.",
      );
    } finally {
      // Also on success: <Activity> keeps this state, and a screen that comes back still
      // "committing" would drop every code on the next visit.
      setCommitting(false);
    }
  }

  const patchEntry = useCallback((id: string, change: Partial<BatchEntry>) => {
    updateBatch((entries) =>
      entries.map((entry) =>
        entry.id === id ? { ...entry, ...change } : entry,
      ),
    );
  }, []);

  /**
   * Fragt nach, was wir ueber diesen Barcode wissen.
   *
   * Erst die eigene Liste (`/api/items/known` -> `product_knowledge`), denn
   * die traegt die Einordnung: Kategorie, Ort und den Namen, unter dem der
   * Nutzer das Produkt selbst gefuehrt hat. Nur wenn sie ihn nicht kennt,
   * geht die zweite Frage an Open Food Facts -- serverseitig, wie die CSP es
   * verlangt (`connect-src 'self'`, der OFF-Aufruf steckt hinter `/api/lookup`).
   *
   * Der Eintrag steht schon in der Ablage, bevor die Antwort da ist -- sonst
   * haette der Nutzer fuer eine halbe Sekunde keinen Beleg dafuer, dass sein
   * Scan angekommen ist.
   */
  const resolveEntry = useCallback(
    async (id: string, barcode: string) => {
      const query = `barcode=${encodeURIComponent(barcode)}`;
      try {
        const knownRes = await fetch(`/api/items/known?${query}`);
        const known = knownRes.ok
          ? ((await knownRes.json()) as {
              found: boolean;
              category?: string;
              name?: string;
              placeId?: number | null;
            })
          : { found: false };

        if (known.found && known.category) {
          patchEntry(id, {
            known: true,
            category: known.category,
            placeId: known.placeId ?? null,
            ...(known.name ? { name: known.name } : {}),
          });
          return;
        }

        const lookupRes = await fetch(`/api/lookup?${query}`);
        const lookup = lookupRes.ok
          ? ((await lookupRes.json()) as { found: boolean; name?: string })
          : { found: false };
        if (lookup.found && lookup.name) patchEntry(id, { name: lookup.name });
      } catch {
        // Ohne Antwort bleibt der Barcode als Name stehen. Umbenennen kann
        // der Nutzer im Pruef-Flow, und ein Fehlerbanner mitten im Scannen
        // hilft ihm dabei nicht.
      } finally {
        setResolving((ids) => ids.filter((entryId) => entryId !== id));
      }
    },
    [patchEntry],
  );

  /**
   * Ein bestaetigter Treffer geht in die Ablage.
   *
   * Derselbe Barcode ein zweites Mal erhoeht die Menge, statt eine zweite
   * Zeile anzulegen (die Regel steht in `mergeEntry`, weil der
   * Rechnungsimport sie genauso braucht). Nachgefragt wird dann nicht noch
   * einmal, und das Blatt geht auch nicht wieder auf -- sonst datierte man
   * denselben Joghurt zweimal.
   */
  function captureBarcode(barcode: string) {
    const existing = readBatch().find((entry) => entry.barcode === barcode);
    const entry = createEntry(
      existing
        ? { source: "scan", barcode, quantity: 1 }
        : { source: "scan", barcode, name: barcode, quantity: 1 },
    );
    updateBatch((entries) => mergeEntry(entries, entry));
    setLastTouchedId(existing ? existing.id : entry.id);
    if (existing) return;
    setResolving((ids) => [...ids, entry.id]);
    void resolveEntry(entry.id, barcode);
    if (autoExpiry) openSheet(entry.id);
  }

  const camera = useScanCamera();
  const [cameraPickerOpen, setCameraPickerOpen] = useState(false);
  const scanner = useBarcodeScanner(videoRef, {
    paused: activeId !== null || committing,
    camera,
    onCode: captureBarcode,
    onCameraChange: setScanCamera,
  });

  // Die zuletzt getroffene Zeile ins Sichtfeld holen. Bei einem langen
  // Einkauf scrollt die Ablage, und der Beleg dafuer, dass der Scan
  // angekommen ist, laege sonst unterhalb der Kante.
  useEffect(() => {
    if (!lastTouchedId) return;
    trayRef.current
      ?.querySelector(`[data-entry-id="${lastTouchedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [lastTouchedId, batch]);

  // Die Kamera ist der Inhalt dieses Screens, nicht ein Element darin: der
  // Abstand aus dem Layout wird hier zurueckgenommen, damit das Bild bis an
  // die Fensterkante laeuft. Den Inset braucht dann nur noch die Kopfzeile,
  // damit ihre Knoepfe nicht unter der Statusleiste liegen.
  //
  // Das "dark" ist kein Theme-Schalter, sondern eine Feststellung: dieser
  // Screen ist ein Kamerabild und damit immer dunkel, in beiden Themes. Ohne
  // es loeste `text-warning` im hellen Theme zu #a9701a auf -- ein Braun, das
  // auf schwarzem Grund kaum zu lesen ist. Mit ihm ziehen die Tokens die
  // dunklen Werte (#e0b06a), also genau die, die der Entwurf fuer 8e
  // gemessen hat. Der Alternative -- die Farben hier hart hinzuschreiben --
  // steht die Hausregel entgegen, und sie liefe bei der naechsten
  // Palettenaenderung auseinander.
  return (
    <div className="dark relative -mt-[max(env(safe-area-inset-top),1.75rem)] [--finder-h:clamp(112px,19svh,160px)] flex flex-1 flex-col overflow-hidden bg-[#0d1512] text-white">
      {/* absolute inset-0 statt h-full/w-full: manche mobilen Browser (v.a.
          iOS Safari) belassen <video> bei seiner intrinsischen Groesse, obwohl
          object-cover gesetzt ist, solange die Groesse ueber Flex-/Block-Layout
          statt ueber explizite Positionierung bestimmt wird. */}
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          scanner.videoReady ? "opacity-100" : "opacity-0"
        }`}
        muted
        playsInline
      />
      {/* Solange die Kamera startet, steht statt eines schwarzen Rechtecks ein
          ruhiger Verlauf -- der Screen sieht dann nicht kaputt aus. */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_30%,#2c3a30_0%,#16201a_60%,#0d1512_100%)] transition-opacity duration-300 ${
          scanner.videoReady ? "opacity-0" : "opacity-100"
        }`}
      />

      <div className="relative flex items-center justify-between px-4.5 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Scannen abbrechen"
          className="flex size-11 items-center justify-center rounded-full bg-white/16 text-white backdrop-blur-[6px] outline-none focus-visible:ring-3 focus-visible:ring-white/50"
        >
          <X className="size-5" strokeWidth={2} />
        </button>
        <span className="font-heading absolute left-1/2 -translate-x-1/2 text-base font-bold">Scanner</span>
        <div className="flex gap-2">
          {/* Phones with several back lenses often start on one that cannot focus this close and
              only switch to the macro lens after a while; pinning a lens skips that. Only offered
              when the browser exposes more than one. */}
          {scanner.cameras.length > 1 && (
            <button
              type="button"
              aria-label="Kamera wählen"
              onClick={() => setCameraPickerOpen(true)}
              className="flex size-11 items-center justify-center rounded-full bg-white/16 text-white backdrop-blur-[6px] outline-none focus-visible:ring-3 focus-visible:ring-white/50"
            >
              <SwitchCamera className="size-5" />
            </button>
          )}
          {scanner.torchAvailable ? (
            <button
              type="button"
              aria-label={scanner.torchOn ? "Licht ausschalten" : "Licht einschalten"}
              aria-pressed={scanner.torchOn}
              onClick={scanner.toggleTorch}
              className="flex size-11 items-center justify-center rounded-full bg-white/16 text-white backdrop-blur-[6px] outline-none focus-visible:ring-3 focus-visible:ring-white/50"
            >
              {scanner.torchOn ? (
                <Flashlight className="size-5" />
              ) : (
                <FlashlightOff className="size-5" />
              )}
            </button>
          ) : (
            scanner.cameras.length <= 1 && <span className="size-11" aria-hidden="true" />
          )}
        </div>
      </div>

      {/* The finder sits at the centre of the video, not of the space left over: iOS focuses and
          meters on the frame centre, and a finder that drifted up with a growing tray put codes
          out of focus. Everything else is laid out around it. */}
      {/* Der riesige Schlagschatten nach aussen ist die Abdunklung: so
          bleibt genau der Ausschnitt hell, in dem der Code liegen soll --
          der zweite Ring mit seinen 2000px Streuung *ist* die Abdunklung,
          kein Rahmen daneben. */}
      <div className="absolute top-1/2 left-1/2 h-(--finder-h) w-[262px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[34px] shadow-[0_0_0_3px_rgb(255_255_255/0.92),0_0_0_2000px_rgb(0_0_0/0.46)]">
        <span className="bg-primary-light absolute inset-x-4.5 top-4.5 h-1 animate-scan rounded-full shadow-[0_0_20px_var(--primary-light)]" />
      </div>

      <div className="absolute inset-x-0 bottom-[calc(50%+var(--finder-h)/2+1rem)] flex flex-col items-center gap-2 px-6.5">
        {scanner.error && (
          <div className="mb-1 flex flex-col items-center gap-2.5 rounded-2xl bg-black/50 px-5 py-4 backdrop-blur-sm">
            <p className="text-center text-sm font-semibold text-[#e88e78]">
              {scanner.error}
            </p>
            <button
              type="button"
              onClick={scanner.retry}
              className="h-10 rounded-xl border border-white/25 px-4 text-sm font-semibold text-white"
            >
              Kamera neu starten
            </button>
          </div>
        )}

        {/* One line, not a card: everything here sits on top of the viewfinder. The text follows
            the switch, because when the date is asked for is the only difference between the two
            flows. */}
        <p className="rounded-full bg-black/40 px-3 py-1 text-center text-[12px] font-semibold text-white/80 backdrop-blur-[6px]">
          {autoExpiry ? "MHD wird nach jedem Code abgefragt." : "Einfach weiterscannen, geprüft wird danach."}
        </p>

        {/* Der Schalter steht hier und nicht unter "Mehr": wie jemand sein
            Telefon beim Einräumen hält, entscheidet er in dem Moment, in dem er
            davorsteht -- und er muss es vor dem ersten Code entscheiden können,
            also auch bei leerer Ablage. Gemerkt wird er pro Gerät
            (lib/scan-prefs.ts). */}
        <button
          type="button"
          aria-pressed={autoExpiry}
          onClick={() => setAutoExpiry(!autoExpiry)}
          className={cn(
            "font-heading flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-bold backdrop-blur-[8px] outline-none focus-visible:ring-3 focus-visible:ring-white/50",
            autoExpiry
              ? "bg-white/92 text-[#0b1f14]"
              : "border border-white/20 bg-white/10 text-white/75",
          )}
        >
          <CalendarClock className="size-3.5" strokeWidth={2.2} />
          MHD gleich abfragen
        </button>
      </div>

      {/* Der Ausweg gehoert auf diesen Screen: wer hier steht, hat einen Code
          vor sich, den die Kamera nicht liest. Ihn ueber den zentralen
          Hinzufuegen-Button suchen zu lassen, hilft in dem Moment niemandem. */}
      {/* Capped at the space below the finder; a long tray scrolls inside instead of pushing up. */}
      <div className="absolute inset-x-0 bottom-0 flex max-h-[calc(50%-var(--finder-h)/2-0.75rem)] flex-col gap-2.5 px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)]">
        {batch.length > 0 ? (
          <>
            {/* Nur die eigenen Treffer: der Rechnungsimport schreibt in
                denselben Batch, und dessen Zeilen standen hier als waeren sie
                gerade gelesen worden -- mit "bekannt"/"neu" daneben, obwohl
                Belegzeilen gar keinen Barcode haben.

                Die Ablage liegt ueber dem Kamerabild, und dagegen hilft keine
                Flaechenfarbe aus der Palette: --card waere entweder
                undurchsichtig (dann ist das Sucherbild weg) oder als
                --card/85 vom Video her unberechenbar hell. Der Entwurf misst
                deshalb rgba(0,0,0,0.5) hinter blur(8px) mit einer
                Weiss-Kante -- eine Abdunklung, kein Farbwert, und in Tailwind
                genau bg-black/50 + border-white/12. Die Ausnahme steht so im
                Plan (Abschnitt "Batch-Ablage (8e)"). */}
            {scanned.length > 0 && (
              <div className="flex min-h-0 flex-col rounded-[26px] border border-white/12 bg-black/50 p-4 backdrop-blur-[8px]">
                <p className="text-[11px] font-extrabold tracking-[0.1em] text-white/60 uppercase">
                  Ablage · {scanned.length} erfasst
                </p>
                {/* Shrinks with the panel: after the weekly shop there are twenty rows here, and
                    they scroll rather than reach into the finder. aria-live so a screen reader
                    announces the hit -- nobody sees it while the phone points at the pack. */}
                <ul
                  ref={trayRef}
                  aria-live="polite"
                  className="mt-3 min-h-0 space-y-1.5 overflow-y-auto"
                >
                  {scanned.map((entry) => {
                    // Der zuletzt gescannte Eintrag ist immer der, dessen Name
                    // noch die rohe EAN ist -- die Aufloesung zum Produktnamen
                    // laeuft parallel im Hintergrund (resolveEntry). Deshalb
                    // faellt "gerade erkannt" mit "resolving" zusammen: sobald
                    // ein Name da ist, ist der Eintrag nicht mehr der neueste.
                    const justRecognized = entry.id === lastTouchedId;
                    // Farbe und Wort haengen an genau einem Zustand -- als
                    // zwei parallele Ternaerketten liefen sie beim naechsten
                    // Zustand auseinander.
                    // Eine getroffene Entscheidung schlaegt jede Herkunft:
                    // "bekannt" neben einem fertig datierten Artikel sagt nur
                    // noch, wo sein Name herkam, und nicht das, was jetzt zaehlt.
                    const status: TrayStatus =
                      entry.status === "done"
                        ? "done"
                        : entry.status === "skipped"
                          ? "skipped"
                          : justRecognized
                            ? "recognized"
                            : resolving.includes(entry.id)
                              ? "pending"
                              : entry.known
                                ? "known"
                                : "new";
                    const label =
                      entry.status === "done" && entry.expiryDate
                        ? `fertig · ${formatShort(fromDateInputValue(entry.expiryDate))}`
                        : TRAY_STATUS[status].label;
                    return (
                      <li key={entry.id} data-entry-id={entry.id}>
                        {/* Die Zeile ist der Knopf: jeder Artikel in der Ablage
                            laesst sich hier schon fertig machen, und ein
                            verworfener laesst sich so auch wieder hereinholen --
                            das "Doch uebernehmen" des Pruef-Flows, ohne ihn zu
                            betreten. Vor der ersten Antwort noch nicht: bis
                            Name und Einordnung da sind, waere das Blatt eine
                            leere Karte mit einer EAN darin. */}
                        <button
                          type="button"
                          disabled={resolving.includes(entry.id)}
                          onClick={() => openSheet(entry.id)}
                          aria-label={`${entry.name} eintragen`}
                          className={`flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-1.5 text-left text-[14.5px] outline-none focus-visible:ring-3 focus-visible:ring-white/50 ${
                            justRecognized
                              ? // rgba(79,212,140,.18) ist kein Token: der Wert
                                // gehoert nur dieser einen Markierung auf dem
                                // Kamerabild, nicht der Palette.
                                "bg-[rgba(79,212,140,.18)]"
                              : "bg-white/6"
                          }`}
                        >
                        <span
                          className={cn(
                            "min-w-0 flex-1 truncate font-bold",
                            resolving.includes(entry.id)
                              ? "font-mono text-[13px]"
                              : "font-heading",
                            entry.status === "skipped" && "text-white/45 line-through",
                          )}
                        >
                          {entry.name}
                        </span>
                        {entry.quantity > 1 && (
                          <span className="font-mono shrink-0 text-[12.5px] text-white/60">
                            ×{entry.quantity}
                          </span>
                        )}
                        {/* "bekannt"/"neu" meint product_knowledge dieser Liste,
                            nicht Open Food Facts: OFF kennt fast jeden Barcode,
                            sagt aber nichts darueber, ob DIESER Haushalt das
                            Produkt schon einmal einsortiert hat -- und nur das
                            entscheidet, ob der Pruef-Flow gleich nach der
                            Kategorie fragen muss. */}
                        <span
                          className={`font-heading shrink-0 text-[12.5px] font-bold ${TRAY_STATUS[status].className}`}
                        >
                          {label}
                        </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Eine angefangene Rechnung liegt im selben Batch und wird
                gleich mitgeprueft -- verschwiegen ergaebe der Knopf darunter
                keinen Sinn, der zaehlt naemlich alles. */}
            {fromReceipt > 0 && (
              <p className="shrink-0 px-1 text-[12.5px] leading-snug font-semibold text-white/60">
                Aus einer Rechnung warten noch {fromReceipt} Artikel auf die
                Prüfung.
              </p>
            )}

            {/* Schrift #0b1f14 statt --primary-foreground: auf diesem Screen
                ist der Verlauf die hellste Flaeche ueberhaupt, ein weisser
                Text darauf saeuft kaum weniger ab als ein dunkler -- der
                Entwurf misst hier bewusst dunkle Schrift, anders als jeder
                andere Primaerknopf im Repo. */}
            {/* Ein Knopf, zwei Zustaende -- und kein dritter Bildschirm
                dazwischen. Wer im Blatt schon alles entschieden hat, haette im
                Pruef-Flow nichts mehr zu beantworten; der Weg dorthin waere ein
                leerer Durchlauf, nur um "Uebernehmen" zu druecken. Gezaehlt
                wird der ganze Batch und nicht nur die eigenen Scans: liegt eine
                angefangene Rechnung darin, ist eben noch nicht alles
                entschieden, auch wenn jeder gescannte Artikel ein Datum hat.
                Der Hinweis darueber sagt genau das. */}
            {pendingIndex >= 0 ? (
              <Link
                href={`/review/${pendingIndex}`}
                className={cn(
                  buttonVariants(),
                  // shadow-none: der Verlauf ist hier die hellste Flaeche
                  // ueberhaupt, ein Schein darunter waere auf dem
                  // Kamerabild nicht zu sehen und nur Rechenarbeit.
                  "h-14 shrink-0 rounded-[22px] text-[16.5px] text-[#0b1f14] shadow-none",
                )}
              >
                {batch.filter((entry) => entry.status === "pending").length} Artikel
                prüfen
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleCommit}
                disabled={committing}
                className={cn(
                  buttonVariants(),
                  "h-14 shrink-0 rounded-[22px] text-[16.5px] text-[#0b1f14] shadow-none disabled:opacity-60",
                )}
              >
                {committing
                  ? "Wird übernommen …"
                  : `${batch.length} Artikel übernehmen`}
              </button>
            )}
            {/* Der Ausweg bleibt auch mitten im Batch erreichbar: dass Code 1
                bis 4 gelesen wurden, hilft bei dem fuenften nicht, der sich
                nicht lesen laesst. "Kein Barcode vorhanden" faellt hier weg --
                /add ist die Einzelerfassung und wuerde den angefangenen
                Einkauf liegen lassen. */}
            <Link
              href="/scan-ean"
              className="font-heading flex h-9 shrink-0 items-center justify-center text-[13px] font-bold text-white/62"
            >
              EAN von Hand eingeben
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/scan-ean"
              className="mx-auto flex h-10 items-center justify-center rounded-full border border-white/25 bg-white/10 px-5 text-[13px] font-semibold text-white backdrop-blur-sm"
            >
              EAN von Hand eingeben
            </Link>
            <Link
              href="/add"
              className="flex h-9 items-center justify-center text-[13px] font-semibold text-white/60"
            >
              Kein Barcode vorhanden
            </Link>
          </>
        )}
      </div>

      {/* Liegt in einem Portal und damit ausserhalb des dark-Wrappers: das
          Blatt traegt das Theme der App, nicht die Dunkelheit des Suchers.
          `today` steht erst, wenn es einmal geoeffnet wurde -- vorher gibt es
          nichts zu zeigen und `new Date()` duerfte im Prerender gar nicht
          fallen. */}
      <Sheet open={cameraPickerOpen} onOpenChange={setCameraPickerOpen} title="Kamera wählen">
        <div className="flex flex-col gap-2 px-1.5 pb-2">
          {[null, ...scanner.cameras].map((option) => (
            <Chip
              key={option?.deviceId ?? "auto"}
              active={(option?.deviceId ?? null) === (camera?.deviceId ?? null)}
              onClick={() => {
                setScanCamera(option);
                setCameraPickerOpen(false);
              }}
              className="h-11 w-full justify-start"
            >
              <span className="truncate">{option ? option.label : "Automatisch"}</span>
            </Chip>
          ))}
        </div>
      </Sheet>

      {today && (
        <ScanExpirySheet
          entry={activeEntry}
          resolving={activeId !== null && resolving.includes(activeId)}
          categories={categories}
          places={places}
          today={today}
          onClose={() => setActiveId(null)}
          onDecide={decideActive}
        />
      )}
    </div>
  );
}
