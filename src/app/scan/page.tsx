"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  BrowserCodeReader,
  BrowserMultiFormatReader,
  HTMLCanvasElementLuminanceSource,
} from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import {
  BarcodeFormat,
  ChecksumException,
  DecodeHintType,
  FormatException,
  NotFoundException,
} from "@zxing/library";
import { Flashlight, FlashlightOff, X } from "lucide-react";
import {
  createEntry,
  mergeEntry,
  readBatch,
  updateBatch,
  useBatch,
  type BatchEntry,
} from "@/lib/review-batch";

// @zxing/browser meldet fuer sein Canvas-Bild "Drehen wird unterstuetzt",
// kann es aber nicht: HTMLCanvasElementLuminanceSource initialisiert
// tempCanvasElement nie, und getTempCanvasElement() prueft mit
// "null === this.tempCanvasElement" -- bei undefined greift der Zweig nicht,
// die Methode liefert undefined zurueck und rotate() wirft
// "Could not create a Canvas element.".
//
// Der OneDReader betritt diesen Pfad bei jedem Frame, den er nicht lesen
// konnte, sobald TRY_HARDER gesetzt ist (OneDReader.decode: tryHarder &&
// image.isRotateSupported()). Der MultiFormatReader faengt den Fehler ab,
// haelt ihn aber fuer unerwartet und schreibt eine Warnung -- daher die
// Konsolenflut auf /scan, obwohl der Scanner einwandfrei arbeitet.
//
// Deshalb hier die ehrliche Antwort: gedreht werden kann nicht. Damit
// ueberspringt der Reader den Zweig, statt ihn jedes Mal krachen zu lassen.
// Gekostet hat er ohnehin nichts -- selbst mit erzeugtem Canvas taeuscht
// rotate() nur: es tauscht den Puffer aus, laesst width/height der
// LuminanceSource aber unveraendert, das gedrehte Bild waere also gar nicht
// lesbar. TRY_HARDER bleibt gesetzt, denn seinen zweiten Effekt -- deutlich
// dichter abgetastete Bildzeilen -- liefert es weiterhin.
HTMLCanvasElementLuminanceSource.prototype.isRotateSupported = function () {
  return false;
};

// Ohne Hints probiert der MultiFormatReader pro Frame saemtliche Formate durch
// -- QR, Micro-QR, Aztec, DataMatrix, PDF417 und alle 1D-Varianten. Auf
// Lebensmitteln steht nichts davon: dort sind es EAN-13, EAN-8, UPC-A oder
// UPC-E. Die Beschraenkung spart pro Bild ein Vielfaches an Rechenzeit, der
// Code rastet schneller ein und das Telefon bleibt kuehler.
const SCAN_HINTS = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E],
  ],
  [DecodeHintType.TRY_HARDER, true],
]);

// Waehrend der kontinuierlichen Live-Scan-Schleife feuert der Decoder bei
// jedem Frame ohne vollstaendig lesbaren Code eine dieser drei Exceptions --
// das ist normales Verhalten (kein Code im Bild / Code nur teilweise
// erkannt), nicht der Fehlerfall. Auf manchen Geraeten (v.a. Mobil-Kameras
// mit hoeherer Aufloesung) tritt das haeufiger als NotFoundException auf,
// daher muessen auch Checksum-/FormatException ignoriert werden - sonst
// blinkt die Fehlermeldung auch bei einem erfolgreichen Scan kurz auf.
//
// instanceof statt err.name-Stringvergleich: im Next.js-Produktionsbuild
// werden Klassennamen minifiziert (z.B. "NotFoundException" -> "e"), daher
// lieferte err.name in Produktion nie einen Treffer und JEDER "kein Code im
// Bild"-Frame wurde faelschlich als fataler Fehler behandelt -- das war die
// eigentliche Ursache der staendigen Fehlermeldung auf dem iPhone.
function isExpectedDecodeError(err: unknown) {
  return (
    err instanceof NotFoundException ||
    err instanceof ChecksumException ||
    err instanceof FormatException
  );
}

// Jeder Fehler, der NICHT in EXPECTED_DECODE_ERRORS steht, wird von
// @zxing/browser intern als fatal behandelt: die Scan-Schleife bricht ab
// UND der Kamera-Stream wird disposed (siehe BrowserCodeReader.scan/
// decodeFromStream). Auf iPhones passiert das vor allem beim allerersten
// Frame, wenn readyState schon "playing" meldet, videoWidth/-Height aber
// noch 0 sind (canvas.getImageData wirft dann ein natives IndexSizeError,
// keine ZXing-Exception) -- daher starten wir die Kamera hier automatisch
// neu statt den Nutzer mit einer toten Kamera sitzen zu lassen.
//
// Fuer genau dieses "Video noch nicht bereit"-Szenario bekommt der Restart
// ein eigenes, grosszuegigeres Budget: auf manchen iPhones dauert es laenger
// als die 2*250ms des allgemeinen Budgets, bis videoWidth/-Height einen Wert
// > 0 melden, wodurch sonst die Fehlermeldung aufblitzt, bevor ueberhaupt
// ein Frame gescannt wurde -- der Scan-Loop laeuft danach aber normal weiter.
// Ein echter, wiederholter Fehler bei bereits laufendem Video (kleines
// Budget) bleibt weiterhin ein Fehlerfall.
const MAX_SILENT_RESTARTS = 2;
const MAX_STARTUP_RESTARTS = 12;

// Ein einzelner Treffer ist kein Beweis. Zwar traegt jeder dieser vier
// Codes eine Pruefziffer, aber die faengt nur einen Teil der Lesefehler ab:
// bei EAN-8 und UPC-E sind es acht bzw. sechs Stellen, sodass eine falsch
// gelesene Ziffernfolge mit rund 1:10 trotzdem eine gueltige Pruefziffer
// ergibt -- und weil der Decoder zehnmal in der Sekunde ueber ein
// verwackeltes Bild laeuft, passiert dieses 1:10 im Alltag oft genug. Genau
// das ist das "beim ersten Mal falsch, beim zweiten Mal richtig".
//
// Deshalb zaehlt hier nicht der erste Treffer, sondern der wiederholte:
// derselbe Code muss mehrfach hintereinander herauskommen. Ein Lesefehler
// ist zufaellig und faellt beim naechsten Frame anders aus, der echte Code
// dagegen bleibt derselbe. Die kurzen Formate brauchen einen Treffer mehr,
// weil ihre Pruefziffer weniger absichert.
const REQUIRED_MATCHES = 2;
const REQUIRED_MATCHES_SHORT = 3;

// Die Serie muss zusammenhaengen: liegt zwischen zwei gleichen Treffern zu
// viel Zeit, war der zweite ein neuer Scan und kein Beleg fuer den ersten.
const MATCH_WINDOW_MS = 2000;

// Seit dem Batch-Scan haelt der Scanner nach einem Treffer nicht mehr an --
// und damit stellt sich eine Frage, die es vorher nicht gab: wann zaehlt
// derselbe Code ein zweites Mal? Die Serie nach dem Treffer
// zurueckzusetzen reicht dafuer nicht. Wer die Packung noch in der Hand
// haelt, waehrend er ueberlegt, liefert weiter lesbare Frames; die Serie
// waere nach zwei Bildern erneut voll und der Joghurt haette stillschweigend
// Menge 4.
//
// Deshalb zaehlt der Code erst wieder, wenn er zwischendurch aus dem Bild
// war: jede vollstaendige Serie -- angenommen oder nicht -- frischt den
// Zeitstempel auf, und nur eine Pause laenger als dieses Fenster macht ihn
// wieder zaehlbar. Anderthalb Sekunden, weil eine Serie bei
// delayBetweenScanAttempts = 500ms schon rund eine halbe Sekunde
// ununterbrochener Sicht braucht: kuerzer waere die Pause nicht sicher von
// einem verwackelten Frame zu unterscheiden, laenger stuende sie dem im Weg,
// der zwei gleiche Becher bewusst nacheinander scannt.
const REHIT_COOLDOWN_MS = 1500;

// delayBetweenScanSuccess ist die Pause NACH einem Treffer -- mit dem
// Vorgabewert 500ms haette jede Bestaetigung eine halbe Sekunde gekostet.
// Auf 100ms gesenkt liegt die Serie innerhalb eines Wimpernschlags, der
// bestaetigte Scan fuehlt sich also so schnell an wie vorher der
// ungepruefte. delayBetweenScanAttempts bleibt bei der Vorgabe: das ist die
// Pause zwischen erfolglosen Versuchen, und die haelt das Telefon kuehl.
const READER_OPTIONS = {
  delayBetweenScanAttempts: 500,
  delayBetweenScanSuccess: 100,
};

// Je hoeher aufgeloest das Bild, desto mehr Pixel liegen auf einem Strich --
// und ein Strichcode, dessen schmalste Linie nur ein bis zwei Pixel breit
// ist, ist die eigentliche Quelle der Fehllesungen. Ohne Angabe liefern
// viele Kameras 640x480; "ideal" erzwingt nichts, sondern nimmt das
// naechstbeste, was das Geraet kann.
const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  facingMode: "environment",
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

/**
 * Haelt einen Leser an, ohne dass sein Versprechen unbehandelt liegenbleibt.
 *
 * `IScannerControls.stop` ist als `void` typisiert, ist auf einem Geraet mit
 * Licht aber asynchron: @zxing/browser haengt dort ein `switchTorch(false)`
 * an (BrowserCodeReader.decodeFromStream). Ein `applyConstraints` auf einer
 * bereits gestoppten Spur lehnt ab -- und das landete als unbehandelte
 * Ablehnung in der Konsole, ausgerechnet beim Verlassen des Screens.
 */
function stopReader(controls: IScannerControls | null | undefined): void {
  if (!controls) return;
  void Promise.resolve(controls.stop() as unknown).catch(() => {});
}

type MatchStreak = { text: string | null; format: BarcodeFormat | null; count: number; at: number };

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const trayRef = useRef<HTMLUListElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streakRef = useRef<MatchStreak>({ text: null, format: null, count: 0, at: 0 });
  const lastHitRef = useRef<{ text: string | null; at: number }>({ text: null, at: 0 });
  const silentRestartsRef = useRef(0);
  const startupRestartsRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [retrySession, setRetrySession] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  // Der Batch liegt nicht im State dieses Screens, sondern in einem Speicher
  // ausserhalb von React (siehe lib/review-batch.ts). Das loest zwei Probleme
  // auf einmal.
  //
  // Erstens die Decoder-Schleife: @zxing/browser bekommt sie genau einmal je
  // Kamerastart uebergeben, sie schliesst also ueber die Werte des Rendern,
  // in dem sie entstanden ist. Ueber einen State-Wert saehe sie nach jedem
  // Treffer weiterhin den leeren Batch und legte fuer denselben Barcode eine
  // zweite Zeile an, statt die Menge zu erhoehen.
  //
  // Zweitens die Rueckkehr aus dem Pruef-Flow: /scan bleibt unter Cache
  // Components per <Activity> am Leben, eine Kopie im State zeigte danach
  // also noch den Stand von vor der Pruefung -- genau der Bug, den /confirm
  // mit der Produkt-DB schon einmal hatte.
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

  const patchEntry = useCallback((id: string, change: Partial<BatchEntry>) => {
    updateBatch((entries) =>
      entries.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)),
    );
  }, []);

  /**
   * Fragt nach, was wir ueber diesen Barcode wissen.
   *
   * Erst die eigene Liste (`/api/items/known` -> `product_knowledge`), denn
   * die traegt die Einordnung: Kategorie, Ort und den Namen, unter dem der
   * Nutzer das Produkt selbst gefuehrt hat. Nur wenn sie ihn nicht kennt,
   * geht die zweite Frage an Open Food Facts -- die liefert ausschliesslich
   * einen Namen und ist ein Aufruf nach draussen, den ein bekanntes Produkt
   * nicht rechtfertigt. Serverseitig, wie die CSP es verlangt: `connect-src`
   * ist `'self'`, der OFF-Aufruf steckt hinter `/api/lookup`.
   *
   * Beides laeuft nebenher weiter, waehrend gescannt wird. Der Eintrag steht
   * schon in der Ablage, bevor die Antwort da ist -- sonst haette der Nutzer
   * fuer eine halbe Sekunde keinen Beleg dafuer, dass sein Scan angekommen
   * ist, und wuerde ein zweites Mal ueber dieselbe Packung fahren.
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
   * einmal -- Name und Einordnung stehen ja schon da.
   */
  const captureBarcode = useCallback(
    (barcode: string) => {
      // Frisch aus dem Speicher, nicht aus dem Render-Wert: dieser Callback
      // haengt an der Decoder-Schleife und lebt laenger als der Render, in
      // dem er entstanden ist.
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
    },
    [resolveEntry],
  );

  // Die zuletzt getroffene Zeile ins Sichtfeld holen. Bei einem langen
  // Einkauf scrollt die Ablage, und der Beleg dafuer, dass der Scan
  // angekommen ist, laege sonst unterhalb der Kante.
  useEffect(() => {
    if (!lastTouchedId) return;
    trayRef.current
      ?.querySelector(`[data-entry-id="${lastTouchedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [lastTouchedId, batch]);

  useEffect(() => {
    // streakRef/lastHitRef/silentRestartsRef sind Refs und ueberleben das
    // Verstecken via <Activity> (siehe node_modules/next/dist/docs/
    // 01-app/02-guides/preserving-ui-state.md) -- ohne diesen Reset traege
    // jeder Besuch die halbe Serie und die Sperrzeit des vorigen mit sich
    // herum, und der erste Code nach der Rueckkehr wuerde je nachdem zu
    // frueh oder gar nicht gezaehlt. Dieser Effect laeuft bei jedem
    // Hidden->Visible-Wechsel erneut, also gibt jeder Besuch hier eine
    // frische Scan-Session.
    let active = true;
    let restartTimeoutId: ReturnType<typeof setTimeout> | undefined;
    streakRef.current = { text: null, format: null, count: 0, at: 0 };
    lastHitRef.current = { text: null, at: 0 };
    silentRestartsRef.current = 0;
    startupRestartsRef.current = 0;

    function isVideoReady() {
      const video = videoRef.current;
      return !!video && video.videoWidth > 0 && video.videoHeight > 0;
    }

    function startScanning() {
      if (!active) return;
      setError(null);
      setVideoReady(false);
      // Jeder (Neu-)Start bekommt einen frischen Stream, also auch einen
      // frischen Torch-Zustand.
      setTorchOn(false);
      setTorchAvailable(false);
      const reader = new BrowserMultiFormatReader(SCAN_HINTS, READER_OPTIONS);

      reader
        .decodeFromConstraints(
          { video: VIDEO_CONSTRAINTS },
          videoRef.current ?? undefined,
          (result, err) => {
            if (!active) return;
            if (result) {
              const text = result.getText();
              const format = result.getBarcodeFormat();
              const now = Date.now();
              const streak = streakRef.current;

              // Derselbe Code wie eben: die Serie waechst. Ein anderer Code
              // -- oder eine zu lange Pause -- setzt sie auf diesen Treffer
              // zurueck, statt zwei unabhaengige Lesungen zu addieren.
              const continues =
                streak.text === text &&
                streak.format === format &&
                now - streak.at <= MATCH_WINDOW_MS;
              streakRef.current = {
                text,
                format,
                count: continues ? streak.count + 1 : 1,
                at: now,
              };

              const required =
                format === BarcodeFormat.EAN_8 || format === BarcodeFormat.UPC_E
                  ? REQUIRED_MATCHES_SHORT
                  : REQUIRED_MATCHES;
              if (streakRef.current.count < required) return;

              // Die Serie hat sich erfuellt -- der Code ist im Bild. Das
              // haelt die Sperrzeit offen, unabhaengig davon, ob der Treffer
              // gleich auch gezaehlt wird: siehe REHIT_COOLDOWN_MS.
              const lastHit = lastHitRef.current;
              const repeat = lastHit.text === text && now - lastHit.at < REHIT_COOLDOWN_MS;
              lastHitRef.current = { text, at: now };

              // Die Serie faengt von vorn an. Ohne das waere sie im naechsten
              // Bild sofort wieder voll (count zaehlt ja weiter), und
              // derselbe Code schluege im Sekundentakt erneut an.
              streakRef.current = { text: null, format: null, count: 0, at: 0 };

              // Der Scanner laeuft weiter: kein stop(), kein router.push.
              // Genau das ist der Batch-Scan -- gesammelt wird jetzt,
              // geprueft wird danach in /review.
              // Ein gelesener Code beweist, dass die Kamera laeuft.
              clearScanError();
              if (!repeat) captureBarcode(text);
              return;
            }
            if (err && !isExpectedDecodeError(err)) {
              console.error("Barcode scan error:", err);
              const videoStillStarting = !isVideoReady();
              const canRestart = videoStillStarting
                ? startupRestartsRef.current < MAX_STARTUP_RESTARTS
                : silentRestartsRef.current < MAX_SILENT_RESTARTS;
              if (canRestart) {
                if (videoStillStarting) {
                  startupRestartsRef.current += 1;
                } else {
                  silentRestartsRef.current += 1;
                }
                controlsRef.current?.stop();
                restartTimeoutId = setTimeout(() => {
                  if (active) startScanning();
                }, 250);
              } else {
                setError("Fehler beim Scannen. Bitte erneut versuchen.");
              }
            }
          },
        )
        .then((controls) => {
          if (!active) {
            controls.stop();
          } else {
            controlsRef.current = controls;
            // Vorratsschrank und Kuehlschrank sind dunkel. switchTorch ist in
            // @zxing/browser als experimentell markiert und fehlt auf vielen
            // Geraeten -- deshalb erscheint der Schalter nur, wenn er da ist.
            setTorchAvailable(typeof controls.switchTorch === "function");
          }
        })
        .catch((err: Error) => {
          console.error("Camera start error:", err);
          if (active) {
            setError(
              err.name === "NotAllowedError"
                ? "Kamera-Zugriff wurde verweigert. Bitte in den Browser-Einstellungen erlauben."
                : "Kamera konnte nicht gestartet werden.",
            );
          }
        });
    }

    // React StrictMode (dev only) runs this effect's setup, then its cleanup,
    // then the setup again, synchronously. Deferring den Start um einen Tick
    // sorgt dafuer, dass nur der ueberlebende Durchlauf die Kamera oeffnet -
    // sonst kollidieren zwei gleichzeitige getUserMedia-Aufrufe.
    const timeoutId = setTimeout(startScanning, 0);

    return () => {
      active = false;
      clearTimeout(timeoutId);
      clearTimeout(restartTimeoutId);
      stopReader(controlsRef.current);
      controlsRef.current = null;
      // Der Griff, der wirklich loslaesst.
      //
      // React raeumt diesen Effect auch auf, wenn Cache Components den
      // Screen nur per <Activity> versteckt (node_modules/next/dist/docs/
      // 01-app/02-guides/preserving-ui-state.md, "Effect and media
      // cleanup") -- der Zeitpunkt stimmte also, das stop() darueber traf
      // aber nur den zuletzt eingetragenen Leser. @zxing/browser fuehrt
      // ueber BrowserCodeReader.streamTracker Buch ueber JEDEN Stream, den
      // sein getUserMedia geoeffnet hat; releaseAllStreams beendet deren
      // Spuren. Damit erlischt die Kameraleuchte auch dann, wenn oben
      // trotz allem noch etwas durchgerutscht ist -- und der naechste
      // Besuch findet ein freies Geraet vor statt eines, das noch belegt
      // ist und ein schwarzes Bild liefert.
      BrowserCodeReader.releaseAllStreams();
    };
  }, [captureBarcode, retrySession]);

  function handleRetry() {
    setRetrySession((s) => s + 1);
  }

  /**
   * Nimmt eine Fehlermeldung zurueck, sobald sie widerlegt ist.
   *
   * Sie wurde bisher nur beim Start geloescht. Ein Startholpern -- auf
   * iPhones meldet das Video "playing", bevor videoWidth einen Wert hat --
   * verbrauchte also das Neustart-Budget, setzte die Meldung, und der Leser,
   * der danach einwandfrei lief, nahm sie nie zurueck: der Testlauf zeigte
   * "Fehler beim Scannen" ueber einer Ablage, in der gerade ein frisch
   * gelesener Barcode stand. Ein laufendes Bild und ein erkannter Code sind
   * der Gegenbeweis, und beide melden sich hier.
   *
   * Der funktionale Updater ist kein Zierrat: React bricht ab, wenn er
   * denselben Wert zurueckgibt, also kostet der Aufruf im Normalfall -- kein
   * Fehler gesetzt -- kein zusaetzliches Rendern, obwohl er bei jedem
   * Treffer kommt.
   */
  function clearScanError() {
    setError((current) => (current === null ? current : null));
    silentRestartsRef.current = 0;
    startupRestartsRef.current = 0;
  }

  async function toggleTorch() {
    const next = !torchOn;
    try {
      await controlsRef.current?.switchTorch?.(next);
      setTorchOn(next);
    } catch {
      // Manche Geraete melden die Faehigkeit und verweigern sie dann doch.
      setTorchAvailable(false);
    }
  }

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
    <div className="dark relative -mt-[max(env(safe-area-inset-top),1.75rem)] flex flex-1 flex-col overflow-hidden bg-[#0b0f0c] text-white">
      {/* absolute inset-0 statt h-full/w-full: manche mobilen Browser (v.a.
          iOS Safari) belassen <video> bei seiner intrinsischen Groesse, obwohl
          object-cover gesetzt ist, solange die Groesse ueber Flex-/Block-Layout
          statt ueber explizite Positionierung bestimmt wird. */}
      <video
        ref={videoRef}
        onPlaying={() => {
          // "playing" heisst nur, dass Frames fliessen -- Safari braucht danach
          // noch ein bis zwei gemalte Frames, bis die object-cover-Zuschneidung
          // tatsaechlich korrekt gerendert ist (sonst blitzt kurz ein falsch
          // zugeschnittenes erstes Frame auf). Zwei verschachtelte rAF warten,
          // bis mindestens ein Paint dazwischen stattgefunden hat, bevor wir
          // aufdecken.
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              setVideoReady(true);
              // Das Bild steht -- was beim Start schiefging, ist damit
              // erledigt und darf nicht als Fehler stehenbleiben.
              clearScanError();
            });
          });
        }}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
          videoReady ? "opacity-100" : "opacity-0"
        }`}
        muted
        playsInline
      />
      {/* Solange die Kamera startet, steht statt eines schwarzen Rechtecks ein
          ruhiger Verlauf -- der Screen sieht dann nicht kaputt aus. */}
      <div
        aria-hidden="true"
        className={`absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_30%,#2a332c_0%,#12170f_60%,#0b0f0c_100%)] transition-opacity duration-300 ${
          videoReady ? "opacity-0" : "opacity-100"
        }`}
      />

      <div className="relative flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),0.75rem)]">
        <button
          type="button"
          onClick={() => router.push("/")}
          aria-label="Scannen abbrechen"
          className="flex size-10.5 items-center justify-center rounded-lg bg-white/15 text-white backdrop-blur-sm outline-none focus-visible:ring-3 focus-visible:ring-white/50"
        >
          <X className="size-5" strokeWidth={2} />
        </button>
        <span className="text-[15px] font-bold">Batch-Scan</span>
        {torchAvailable ? (
          <button
            type="button"
            aria-label={torchOn ? "Licht ausschalten" : "Licht einschalten"}
            aria-pressed={torchOn}
            onClick={toggleTorch}
            className="flex size-10.5 items-center justify-center rounded-lg bg-white/15 text-white backdrop-blur-sm outline-none focus-visible:ring-3 focus-visible:ring-white/50"
          >
            {torchOn ? <Flashlight className="size-5" /> : <FlashlightOff className="size-5" />}
          </button>
        ) : (
          <span className="size-10.5" aria-hidden="true" />
        )}
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center gap-6.5 px-7">
        {/* Der riesige Schlagschatten nach aussen ist die Abdunklung: so
            bleibt genau der Ausschnitt hell, in dem der Code liegen soll. */}
        <div className="relative h-48 w-[270px] overflow-hidden rounded-[26px] shadow-[0_0_0_2px_rgb(255_255_255/0.9),0_0_0_2000px_rgb(0_0_0/0.42)]">
          <span className="absolute inset-x-4 top-4 h-[3px] animate-scan rounded-sm bg-[#4dc779] shadow-[0_0_18px_#4dc779]" />
        </div>
        <p className="text-center text-[15px] leading-relaxed font-semibold text-balance text-white/90">
          Einfach weiterscannen.
          <br />
          <span className="font-medium text-white/55">
            Geprüft wird danach — ein Artikel nach dem anderen.
          </span>
        </p>

        {error && (
          <div className="flex flex-col items-center gap-2.5 rounded-2xl bg-black/50 px-5 py-4 backdrop-blur-sm">
            <p className="text-center text-sm font-semibold text-[#e88e78]">{error}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="h-10 rounded-xl border border-white/25 px-4 text-sm font-semibold text-white"
            >
              Kamera neu starten
            </button>
          </div>
        )}
      </div>

      {/* Der Ausweg gehoert auf diesen Screen: wer hier steht, hat einen Code
          vor sich, den die Kamera nicht liest. Ihn ueber den zentralen
          Hinzufuegen-Button suchen zu lassen, hilft in dem Moment niemandem. */}
      <div className="relative flex flex-col gap-2.5 px-5 pb-[max(env(safe-area-inset-bottom),2.5rem)]">
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
              <div className="rounded-xl border border-white/12 bg-black/50 p-3.5 backdrop-blur-[8px]">
                <p className="text-[11px] font-bold tracking-[0.08em] text-white/55 uppercase">
                  Erfasst
                </p>
                {/* max-h statt fester Hoehe: nach dem Wocheneinkauf stehen hier
                    zwanzig Zeilen, und der Sucher darf darunter nicht
                    verschwinden. aria-live, damit ein Screenreader den Treffer
                    meldet -- sehen kann man ihn beim Scannen ohnehin nicht,
                    weil das Telefon auf die Packung zeigt. */}
                <ul
                  ref={trayRef}
                  aria-live="polite"
                  className="mt-2.5 max-h-[30vh] space-y-1 overflow-y-auto"
                >
                  {scanned.map((entry) => (
                    <li
                      key={entry.id}
                      data-entry-id={entry.id}
                      className={`flex items-center gap-2 rounded-md px-1.5 py-1 text-[14px] font-semibold ${
                        entry.id === lastTouchedId ? "bg-white/8" : ""
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                      {entry.quantity > 1 && (
                        <span className="shrink-0 text-white/55">×{entry.quantity}</span>
                      )}
                      {/* "bekannt"/"neu" meint product_knowledge dieser Liste,
                          nicht Open Food Facts: OFF kennt fast jeden Barcode,
                          sagt aber nichts darueber, ob DIESER Haushalt das
                          Produkt schon einmal einsortiert hat -- und nur das
                          entscheidet, ob der Pruef-Flow gleich nach der
                          Kategorie fragen muss. */}
                      <span
                        className={`shrink-0 text-[12px] font-semibold ${
                          resolving.includes(entry.id)
                            ? "text-white/35"
                            : entry.known
                              ? "text-white/55"
                              : "text-warning"
                        }`}
                      >
                        {resolving.includes(entry.id) ? "…" : entry.known ? "bekannt" : "neu"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Eine angefangene Rechnung liegt im selben Batch und wird
                gleich mitgeprueft -- verschwiegen ergaebe der Knopf darunter
                keinen Sinn, der zaehlt naemlich alles. */}
            {fromReceipt > 0 && (
              <p className="px-1 text-[12.5px] leading-snug font-semibold text-white/55">
                Aus einer Rechnung warten noch {fromReceipt} Artikel auf die
                Prüfung.
              </p>
            )}

            <Link
              href="/review/0"
              className="bg-primary text-primary-foreground flex h-13 items-center justify-center rounded-[16px] text-[15px] font-extrabold"
            >
              {batch.length} Artikel prüfen
            </Link>
            {/* Der Ausweg bleibt auch mitten im Batch erreichbar: dass Code 1
                bis 4 gelesen wurden, hilft bei dem fuenften nicht, der sich
                nicht lesen laesst. "Kein Barcode vorhanden" faellt hier weg --
                /add ist die Einzelerfassung und wuerde den angefangenen
                Einkauf liegen lassen. */}
            <Link
              href="/scan-ean"
              className="flex h-11 items-center justify-center text-sm font-semibold text-white/60"
            >
              EAN von Hand eingeben
            </Link>
          </>
        ) : (
          <>
            <Link
              href="/scan-ean"
              className="flex h-13 items-center justify-center rounded-[17px] border border-white/25 bg-white/10 text-[15px] font-semibold text-white backdrop-blur-sm"
            >
              EAN von Hand eingeben
            </Link>
            <Link
              href="/add"
              className="flex h-11 items-center justify-center text-sm font-semibold text-white/60"
            >
              Kein Barcode vorhanden
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
