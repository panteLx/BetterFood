"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { ChecksumException, FormatException, NotFoundException } from "@zxing/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const scannedRef = useRef(false);
  const silentRestartsRef = useRef(0);
  const startupRestartsRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");
  const [retrySession, setRetrySession] = useState(0);
  const [videoReady, setVideoReady] = useState(false);

  useLayoutEffect(() => {
    // Mit cacheComponents:true haelt Next.js diese Seite beim Navigieren via
    // React <Activity> nur versteckt (display:none) statt sie zu unmounten -
    // State ueberlebt das (siehe node_modules/next/dist/docs/01-app/
    // 02-guides/preserving-ui-state.md). Reset beim Verstecken (statt
    // synchron im Setup des Kamera-Effects) folgt dem dort empfohlenen
    // Muster und vermeidet ein setState direkt im Effect-Body.
    return () => {
      setManualEntry(false);
      setManualBarcode("");
    };
  }, []);

  useEffect(() => {
    // scannedRef/silentRestartsRef sind Refs und ueberleben das Verstecken
    // via <Activity> ebenfalls (siehe oben) -- ohne diesen Reset bliebe
    // scannedRef.current nach dem ersten erfolgreichen Scan fuer immer true,
    // sobald man zu /scan zurueckkehrt, und jeder weitere erkannte Barcode
    // wuerde stillschweigend ignoriert. Dieser Effect laeuft bei jedem
    // Hidden->Visible-Wechsel erneut, also gibt jeder Besuch hier eine
    // frische Scan-Session.
    let active = true;
    scannedRef.current = false;
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
      const reader = new BrowserMultiFormatReader();

      reader
        .decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current ?? undefined,
          (result, err) => {
            if (!active || scannedRef.current) return;
            if (result) {
              scannedRef.current = true;
              controlsRef.current?.stop();
              router.push(`/confirm?barcode=${encodeURIComponent(result.getText())}`);
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

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between p-4">
        <h1 className="text-lg font-semibold">Barcode scannen</h1>
        <Button variant="ghost" onClick={() => router.push("/")}>
          Abbrechen
        </Button>
      </div>

      <div className="relative mx-4 flex-1 overflow-hidden rounded-xl bg-black">
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
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80" />
      </div>

      {error && (
        <div className="flex flex-col items-center gap-2 p-4">
          <p className="text-center text-sm text-destructive">{error}</p>
          <Button variant="outline" onClick={handleRetry}>
            Kamera neu starten
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2 p-4">
        {manualEntry ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = manualBarcode.trim();
              if (!trimmed) return;
              controlsRef.current?.stop();
              router.push(`/confirm?barcode=${encodeURIComponent(trimmed)}`);
            }}
          >
            <Input
              inputMode="numeric"
              autoFocus
              placeholder="EAN-Nummer eingeben"
              value={manualBarcode}
              onChange={(e) => setManualBarcode(e.target.value)}
            />
            <Button type="submit" disabled={!manualBarcode.trim()}>
              Weiter
            </Button>
          </form>
        ) : (
          <Button variant="outline" className="w-full" onClick={() => setManualEntry(true)}>
            EAN manuell eingeben
          </Button>
        )}
        <Button variant="ghost" className="w-full" onClick={() => router.push("/add")}>
          Stattdessen komplett manuell eingeben
        </Button>
      </div>
    </div>
  );
}
