"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Waehrend der kontinuierlichen Live-Scan-Schleife feuert der Decoder bei
// jedem Frame ohne vollstaendig lesbaren Code eine dieser drei Exceptions --
// das ist normales Verhalten (kein Code im Bild / Code nur teilweise
// erkannt), nicht der Fehlerfall. Auf manchen Geraeten (v.a. Mobil-Kameras
// mit hoeherer Aufloesung) tritt das haeufiger als NotFoundException auf,
// daher muessen auch Checksum-/FormatException ignoriert werden - sonst
// blinkt die Fehlermeldung auch bei einem erfolgreichen Scan kurz auf.
const EXPECTED_DECODE_ERRORS = new Set([
  "NotFoundException",
  "ChecksumException",
  "FormatException",
]);

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);
  const [manualEntry, setManualEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState("");

  useEffect(() => {
    // React StrictMode (dev only) runs this effect's setup, then its cleanup,
    // then the setup again, synchronously. Deferring the actual getUserMedia
    // call by a tick means the first (throwaway) invocation's cleanup has
    // already flipped `cancelled` by the time its timeout fires, so only the
    // surviving invocation ever opens the camera - avoiding the "device busy"
    // error from two concurrent getUserMedia calls against the same webcam.
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    const timeoutId = setTimeout(() => {
      if (cancelled) return;

      reader
        .decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current ?? undefined,
          (result, err) => {
            if (cancelled) return;
            if (result && !scanned) {
              setScanned(true);
              controlsRef.current?.stop();
              router.push(`/confirm?barcode=${encodeURIComponent(result.getText())}`);
            }
            if (err && !EXPECTED_DECODE_ERRORS.has(err.name)) {
              console.error("Barcode scan error:", err);
              setError("Fehler beim Scannen. Bitte erneut versuchen.");
            }
          },
        )
        .then((controls) => {
          if (cancelled) {
            controls.stop();
          } else {
            controlsRef.current = controls;
          }
        })
        .catch((err: Error) => {
          console.error("Camera start error:", err);
          if (!cancelled) {
            setError(
              err.name === "NotAllowedError"
                ? "Kamera-Zugriff wurde verweigert. Bitte in den Browser-Einstellungen erlauben."
                : "Kamera konnte nicht gestartet werden.",
            );
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controlsRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between p-4">
        <h1 className="text-lg font-semibold">Barcode scannen</h1>
        <Button variant="ghost" onClick={() => router.push("/")}>
          Abbrechen
        </Button>
      </div>

      <div className="relative mx-4 flex-1 overflow-hidden rounded-xl bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        <div className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80" />
      </div>

      {error && <p className="p-4 text-center text-sm text-destructive">{error}</p>}

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
