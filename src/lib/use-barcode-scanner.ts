"use client";

import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
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
  ReaderException,
} from "@zxing/library";
import type { ScanCamera } from "@/lib/scan-prefs";

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

// Die Warnung blieb trotzdem, denn sie hat noch eine zweite Quelle. Im
// Java-Original erben NotFound-, Checksum- und FormatException von
// ReaderException, und genau darauf verlaesst sich MultiFormatReader:
// "instanceof ReaderException" heisst "Leser probiert, nichts gefunden,
// weiter", alles andere schreibt er als non-ReaderException in die Konsole.
// Die TypeScript-Portierung (@zxing/library 0.23.0) laesst die drei aber
// direkt von Exception erben -- ReaderException ist dort eine Klasse ohne
// Nachkommen. Damit ist jeder Frame ohne Code eine Warnung, zwei pro
// Sekunde, in jedem Browser und jeder Umgebung.
//
// Hier wird die Erbfolge des Originals nachgezogen. Die drei bleiben, was
// sie sind (der eigene Konstruktor steht als Eigenschaft auf dem Prototyp,
// instanceof NotFoundException trifft weiterhin), sie sind nur zusaetzlich
// eine ReaderException -- und der MultiFormatReader geht wieder still zum
// naechsten Frame ueber.
for (const decodeException of [
  NotFoundException,
  ChecksumException,
  FormatException,
]) {
  if (!(decodeException.prototype instanceof ReaderException)) {
    Object.setPrototypeOf(decodeException.prototype, ReaderException.prototype);
  }
}

// Ohne Hints probiert der MultiFormatReader pro Frame saemtliche Formate durch
// -- QR, Micro-QR, Aztec, DataMatrix, PDF417 und alle 1D-Varianten. Auf
// Lebensmitteln steht nichts davon: dort sind es EAN-13, EAN-8, UPC-A oder
// UPC-E. Die Beschraenkung spart pro Bild ein Vielfaches an Rechenzeit, der
// Code rastet schneller ein und das Telefon bleibt kuehler.
const SCAN_HINTS = new Map<DecodeHintType, unknown>([
  [
    DecodeHintType.POSSIBLE_FORMATS,
    [
      BarcodeFormat.EAN_13,
      BarcodeFormat.EAN_8,
      BarcodeFormat.UPC_A,
      BarcodeFormat.UPC_E,
    ],
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
const VIDEO_SIZE: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
};

function videoConstraints(deviceId: string | null): MediaTrackConstraints {
  return deviceId
    ? { ...VIDEO_SIZE, deviceId: { exact: deviceId } }
    : { ...VIDEO_SIZE, facingMode: "environment" };
}

// Android: "camera2 1, facing front"; iOS: "Front Camera" / "Frontkamera".
const FRONT_CAMERA = /front|vorder|user|selfie/i;

/**
 * The back cameras the browser exposes. Labels are only filled in once camera permission has
 * been granted, so this is called after the stream is running.
 */
async function listBackCameras(): Promise<ScanCamera[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((device) => device.kind === "videoinput" && !FRONT_CAMERA.test(device.label))
    .map((device, index) => ({
      deviceId: device.deviceId,
      label: device.label || `Kamera ${index + 1}`,
    }));
}

function isMissingDevice(err: unknown) {
  return (
    err instanceof Error && (err.name === "OverconstrainedError" || err.name === "NotFoundError")
  );
}

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

type MatchStreak = {
  text: string | null;
  format: BarcodeFormat | null;
  count: number;
  at: number;
};

const NO_STREAK: MatchStreak = { text: null, format: null, count: 0, at: 0 };

/**
 * Runs the camera and the decoder for as long as the calling component is visible, and reports
 * each confirmed barcode once through `onCode`.
 *
 * `paused` keeps the camera and the decoder running (a restart would cost a cold start and the
 * torch) but drops every read. It is a prop derived from the caller's state on purpose: the
 * previous hand-set block flag outlived a commit through <Activity>, and every later visit
 * showed a live camera that never recognised anything.
 *
 * `camera` pins one lens instead of letting the browser choose. When its deviceId no longer
 * opens, the hook starts automatically and reports the same lens found by label through
 * `onCameraChange` -- or `null` when it is gone, so the caller can forget the choice.
 */
export function useBarcodeScanner(
  videoRef: RefObject<HTMLVideoElement | null>,
  {
    paused,
    camera,
    onCode,
    onCameraChange,
  }: {
    paused: boolean;
    camera: ScanCamera | null;
    onCode: (barcode: string) => void;
    onCameraChange: (camera: ScanCamera | null) => void;
  },
) {
  const controlsRef = useRef<IScannerControls | null>(null);
  const streakRef = useRef<MatchStreak>(NO_STREAK);
  const lastHitRef = useRef<{ text: string | null; at: number }>({ text: null, at: 0 });
  const pausedRef = useRef(paused);
  const silentRestartsRef = useRef(0);
  const startupRestartsRef = useRef(0);
  const [session, setSession] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [cameras, setCameras] = useState<ScanCamera[]>([]);
  const cameraId = camera?.deviceId ?? null;
  const cameraLabel = camera?.label ?? null;

  // Layout effect so the pause is in place before the decoder's next task can run, e.g. between
  // the click on "übernehmen" and the import request.
  useLayoutEffect(() => {
    pausedRef.current = paused;
    if (paused) return;
    // On resume the pack that opened the sheet is usually still in front of the lens. Its last
    // streak lies before the pause, far outside REHIT_COOLDOWN_MS, so without a fresh stamp it
    // would silently become quantity 2.
    streakRef.current = NO_STREAK;
    lastHitRef.current = { text: lastHitRef.current.text, at: Date.now() };
  }, [paused]);

  const report = useEffectEvent((barcode: string) => onCode(barcode));
  const reportCamera = useEffectEvent((next: ScanCamera | null) => onCameraChange(next));

  /**
   * Nimmt eine Fehlermeldung zurueck, sobald sie widerlegt ist.
   *
   * Sie wurde bisher nur beim Start geloescht. Ein Startholpern -- auf
   * iPhones meldet das Video "playing", bevor videoWidth einen Wert hat --
   * verbrauchte also das Neustart-Budget, setzte die Meldung, und der Leser,
   * der danach einwandfrei lief, nahm sie nie zurueck. Ein laufendes Bild und
   * ein erkannter Code sind der Gegenbeweis, und beide melden sich hier.
   */
  const clearScanError = useCallback(() => {
    setError((current) => (current === null ? current : null));
    silentRestartsRef.current = 0;
    startupRestartsRef.current = 0;
  }, []);

  useEffect(() => {
    // Die Refs ueberleben das Verstecken via <Activity> (siehe
    // node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md) --
    // ohne diesen Reset traege jeder Besuch die halbe Serie und die Sperrzeit
    // des vorigen mit sich herum. Dieser Effect laeuft bei jedem
    // Hidden->Visible-Wechsel erneut, also gibt jeder Besuch hier eine
    // frische Scan-Session.
    let active = true;
    let restartTimeoutId: ReturnType<typeof setTimeout> | undefined;
    streakRef.current = NO_STREAK;
    lastHitRef.current = { text: null, at: 0 };
    silentRestartsRef.current = 0;
    startupRestartsRef.current = 0;
    const video = videoRef.current;

    // "playing" heisst nur, dass Frames fliessen -- Safari braucht danach
    // noch ein bis zwei gemalte Frames, bis die object-cover-Zuschneidung
    // tatsaechlich korrekt gerendert ist. Zwei verschachtelte rAF warten,
    // bis mindestens ein Paint dazwischen stattgefunden hat.
    function handlePlaying() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!active) return;
          setVideoReady(true);
          clearScanError();
        });
      });
    }
    video?.addEventListener("playing", handlePlaying);

    function isVideoReady() {
      return !!video && video.videoWidth > 0 && video.videoHeight > 0;
    }

    function handleResult(text: string, format: BarcodeFormat) {
      if (pausedRef.current) return;
      const now = Date.now();
      const streak = streakRef.current;

      // Derselbe Code wie eben: die Serie waechst. Ein anderer Code -- oder
      // eine zu lange Pause -- setzt sie auf diesen Treffer zurueck, statt
      // zwei unabhaengige Lesungen zu addieren.
      const continues =
        streak.text === text && streak.format === format && now - streak.at <= MATCH_WINDOW_MS;
      const count = continues ? streak.count + 1 : 1;
      const required =
        format === BarcodeFormat.EAN_8 || format === BarcodeFormat.UPC_E
          ? REQUIRED_MATCHES_SHORT
          : REQUIRED_MATCHES;
      if (count < required) {
        streakRef.current = { text, format, count, at: now };
        return;
      }

      // Die Serie hat sich erfuellt -- der Code ist im Bild. Das haelt die
      // Sperrzeit offen, unabhaengig davon, ob der Treffer gleich auch
      // gezaehlt wird: siehe REHIT_COOLDOWN_MS. Die Serie faengt von vorn an,
      // sonst schluege derselbe Code im Sekundentakt erneut an.
      const lastHit = lastHitRef.current;
      const repeat = lastHit.text === text && now - lastHit.at < REHIT_COOLDOWN_MS;
      lastHitRef.current = { text, at: now };
      streakRef.current = NO_STREAK;

      // Ein gelesener Code beweist, dass die Kamera laeuft.
      clearScanError();
      if (!repeat) report(text);
    }

    // The lens actually requested; drops to null (automatic) when the pinned one does not open.
    let target = cameraId;

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
        .decodeFromConstraints({ video: videoConstraints(target) }, video ?? undefined, (result, err) => {
          if (!active) return;
          if (result) {
            handleResult(result.getText(), result.getBarcodeFormat());
            return;
          }
          if (!err || isExpectedDecodeError(err)) return;

          console.error("Barcode scan error:", err);
          const videoStillStarting = !isVideoReady();
          const canRestart = videoStillStarting
            ? startupRestartsRef.current < MAX_STARTUP_RESTARTS
            : silentRestartsRef.current < MAX_SILENT_RESTARTS;
          if (!canRestart) {
            setError("Fehler beim Scannen. Bitte erneut versuchen.");
            return;
          }
          if (videoStillStarting) {
            startupRestartsRef.current += 1;
          } else {
            silentRestartsRef.current += 1;
          }
          stopReader(controlsRef.current);
          restartTimeoutId = setTimeout(startScanning, 250);
        })
        .then((controls) => {
          if (!active) {
            stopReader(controls);
            return;
          }
          controlsRef.current = controls;
          // switchTorch ist in @zxing/browser als experimentell markiert und
          // fehlt auf vielen Geraeten -- deshalb erscheint der Schalter nur,
          // wenn er da ist.
          setTorchAvailable(typeof controls.switchTorch === "function");
          void listBackCameras()
            .then((found) => {
              if (!active) return;
              setCameras(found);
              if (cameraId === null || target !== null) return;
              // The pinned deviceId did not open. Same lens under a new id, or gone for good.
              reportCamera(found.find((option) => option.label === cameraLabel) ?? null);
            })
            .catch(() => {});
        })
        .catch((err: Error) => {
          if (!active) return;
          if (target !== null && isMissingDevice(err)) {
            target = null;
            startScanning();
            return;
          }
          console.error("Camera start error:", err);
          setError(
            err.name === "NotAllowedError"
              ? "Kamera-Zugriff wurde verweigert. Bitte in den Browser-Einstellungen erlauben."
              : "Kamera konnte nicht gestartet werden.",
          );
        });
    }

    // React StrictMode (dev only) runs this effect's setup, then its cleanup,
    // then the setup again, synchronously. Deferring the start by a tick means
    // only the surviving run opens the camera -- two concurrent getUserMedia
    // calls collide otherwise.
    const timeoutId = setTimeout(startScanning, 0);

    return () => {
      active = false;
      clearTimeout(timeoutId);
      clearTimeout(restartTimeoutId);
      video?.removeEventListener("playing", handlePlaying);
      stopReader(controlsRef.current);
      controlsRef.current = null;
      // React raeumt diesen Effect auch auf, wenn Cache Components den Screen
      // nur per <Activity> versteckt. stop() trifft aber nur den zuletzt
      // eingetragenen Leser; releaseAllStreams beendet jeden Stream, den
      // @zxing/browser je geoeffnet hat. Damit erlischt die Kameraleuchte
      // sicher, und der naechste Besuch findet ein freies Geraet vor statt
      // eines, das noch belegt ist und ein schwarzes Bild liefert.
      BrowserCodeReader.releaseAllStreams();
    };
  }, [videoRef, session, cameraId, cameraLabel, clearScanError]);

  const retry = useCallback(() => setSession((s) => s + 1), []);

  const toggleTorch = useCallback(async () => {
    const next = !torchOn;
    try {
      await controlsRef.current?.switchTorch?.(next);
      setTorchOn(next);
    } catch {
      // Manche Geraete melden die Faehigkeit und verweigern sie dann doch.
      setTorchAvailable(false);
    }
  }, [torchOn]);

  return { error, retry, videoReady, torchAvailable, torchOn, toggleTorch, cameras };
}
