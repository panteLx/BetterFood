"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";
import { Button } from "@/components/ui/button";

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState(false);

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
            // NotFoundException is thrown continuously while no code is visible - ignore it.
            if (err && err.name !== "NotFoundException") {
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

      <div className="p-4">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => router.push("/add")}
        >
          Stattdessen manuell eingeben
        </Button>
      </div>
    </div>
  );
}
