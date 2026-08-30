"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BrowserMultiFormatReader, HTMLCanvasElementLuminanceSource } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import {
  BarcodeFormat,
  ChecksumException,
  DecodeHintType,
  FormatException,
  NotFoundException,
} from "@zxing/library";
import { Flashlight, FlashlightOff, X } from "lucide-react";

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

type MatchStreak = { text: string | null; format: BarcodeFormat | null; count: number; at: number };

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scannedRef = useRef(false);
  const streakRef = useRef<MatchStreak>({ text: null, format: null, count: 0, at: 0 });
  const silentRestartsRef = useRef(0);
  const startupRestartsRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [retrySession, setRetrySession] = useState(0);
  const [videoReady, setVideoReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);

  useEffect(() => {
    // scannedRef/silentRestartsRef sind Refs und ueberleben das Verstecken
    // via <Activity> (siehe node_modules/next/dist/docs/01-app/02-guides/
    // preserving-ui-state.md) -- ohne diesen Reset bliebe scannedRef.current
    // nach dem ersten erfolgreichen Scan fuer immer true, sobald man zu
    // /scan zurueckkehrt, und jeder weitere erkannte Barcode wuerde
    // stillschweigend ignoriert. Dieser Effect laeuft bei jedem
    // Hidden->Visible-Wechsel erneut, also gibt jeder Besuch hier eine
    // frische Scan-Session.
    let active = true;
    scannedRef.current = false;
    streakRef.current = { text: null, format: null, count: 0, at: 0 };
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
            if (!active || scannedRef.current) return;
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

              scannedRef.current = true;
              controlsRef.current?.stop();
              router.push(`/confirm?barcode=${encodeURIComponent(text)}&via=scan`);
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
                setTimeout(() => {
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
      controlsRef.current?.stop();
    };
  }, [router, retrySession]);

  function handleRetry() {
    setRetrySession((s) => s + 1);
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
  return (
    <div className="relative -mt-[max(env(safe-area-inset-top),1.75rem)] flex flex-1 flex-col overflow-hidden bg-[#0b0f0c] text-white">
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
            requestAnimationFrame(() => setVideoReady(true));
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
        <span className="text-[15px] font-bold">Barcode scannen</span>
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
          <span className="absolute inset-x-4 top-4 h-[3px] animate-scan rounded-sm bg-[#74c48d] shadow-[0_0_18px_#74c48d]" />
        </div>
        <p className="text-center text-[15px] leading-relaxed font-semibold text-balance text-white/90">
          Halte den Barcode ins Feld.
          <br />
          <span className="font-medium text-white/55">Wir erkennen ihn automatisch.</span>
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
      </div>
    </div>
  );
}
