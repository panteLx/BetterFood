import { cn } from "@/lib/utils";

/**
 * Avo, das Maskottchen -- eine Avocado.
 *
 * Bewusst kein SVG und keine Bilddatei, sondern ein Stapel absolut
 * positionierter div-Formen mit border-radius. Drei Gruende:
 *
 * 1. Die Figur folgt damit den Tokens. Im Dunkelmodus wird die Schale eine
 *    Stufe heller, ohne dass jemand eine zweite Datei pflegen muesste --
 *    --avo-shell wechselt im .dark-Block, und die Figur wechselt mit.
 * 2. Die Stimmungen kosten nichts. Nur Augen und Mund unterscheiden sich; in
 *    einer Bilddatei waeren das vier Dateien pro Groesse, also zwoelf.
 * 3. Der Wechsel ist animierbar, ohne dass JavaScript etwas rechnen muss.
 *
 * Die Geometrie ist **nicht linear skaliert**, sondern pro Groesse auf ganze
 * Pixel gerundet: bei 30px Breite fallen halbe Pixel als sichtbare
 * Unschaerfe auf, und die Augen sind dann drei statt vier Pixel breit. Die
 * Zahlen unten stehen genau so im Entwurf.
 *
 * Ausdruecklich **ohne Wangen**, in keiner Groesse. Der Kern traegt nur Augen
 * und Mund -- genau das haelt die Figur auch bei 38px im Toast lesbar.
 */

export type AvoSize = "sm" | "md" | "lg";

/**
 * Die Stimmung kommt aus Daten, die die App ohnehin rechnet -- den Eimern aus
 * `expiry.ts`. Sie ist nirgends ein `useState`:
 *
 *   overdue  "Abgelaufen" ist belegt
 *   soon     "Heute" oder "Morgen" ist belegt
 *   happy    kein Artikel unter vier Tagen
 *
 * `cheer` faellt aus dieser Reihe: es ist kein Zustand des Vorrats, sondern
 * eine Eigenschaft der Stelle. Toast, /saved und die Archiv-Statistik zeigen
 * ihn immer.
 */
export type AvoMood = "happy" | "soon" | "overdue" | "cheer";

/**
 * Die Bewegung gehoert zur Stelle, nicht zur Stimmung: derselbe `cheer`-Avo
 * poppt auf /saved, bobbt im Archiv und squisht im Toast. Deshalb ein eigener
 * Prop statt einer Ableitung.
 */
export type AvoAnimation = "bob" | "shake" | "pop" | "squish" | "none";

type Box = {
  bottom: number;
  left: number;
  width: number;
  height: number;
  radius: string;
};

type Face = {
  eyes: Box & { leftRight: number; rotate?: number };
  mouth: Box;
  tongue?: Box;
};

type Shape = {
  width: number;
  height: number;
  /** Fleisch als Einzug von allen vier Seiten -- oben tiefer als seitlich. */
  flesh: { top: number; side: number; bottom: number };
  pit: { bottom: number; left: number; size: number };
  faces: Record<AvoMood, Face>;
};

/** Die Silhouette der Frucht: oben rund, unten schmaler zulaufend. */
const BODY_RADIUS = "50% 50% 46% 46% / 62% 62% 38% 38%";
const PILL = "999px";

const SHAPES: Record<AvoSize, Shape> = {
  lg: {
    width: 128,
    height: 163,
    flesh: { top: 17, side: 16, bottom: 16 },
    pit: { bottom: 23, left: 32, size: 64 },
    faces: {
      happy: {
        eyes: { bottom: 49, left: 46, leftRight: 70, width: 13, height: 15, radius: PILL },
        mouth: { bottom: 31, left: 52, width: 24, height: 13, radius: "0 0 24px 24px" },
      },
      soon: {
        eyes: { bottom: 49, left: 46, leftRight: 70, width: 13, height: 13, radius: PILL },
        mouth: { bottom: 34, left: 56, width: 16, height: 6, radius: PILL },
      },
      overdue: {
        eyes: { bottom: 49, left: 46, leftRight: 70, width: 13, height: 15, radius: PILL },
        mouth: { bottom: 28, left: 55, width: 17, height: 14, radius: PILL },
      },
      cheer: {
        eyes: {
          bottom: 54,
          left: 44,
          leftRight: 68,
          width: 17,
          height: 6,
          radius: PILL,
          rotate: 14,
        },
        mouth: { bottom: 28, left: 48, width: 32, height: 20, radius: "0 0 32px 32px" },
        tongue: { bottom: 28, left: 57, width: 15, height: 8, radius: "999px 999px 0 0" },
      },
    },
  },
  md: {
    width: 54,
    height: 68,
    flesh: { top: 8, side: 7, bottom: 7 },
    pit: { bottom: 10, left: 14, size: 27 },
    faces: {
      happy: {
        eyes: { bottom: 21, left: 20, leftRight: 29, width: 6, height: 7, radius: PILL },
        mouth: { bottom: 14, left: 22, width: 11, height: 6, radius: "0 0 11px 11px" },
      },
      soon: {
        eyes: { bottom: 21, left: 20, leftRight: 29, width: 6, height: 6, radius: PILL },
        mouth: { bottom: 16, left: 23, width: 8, height: 3, radius: PILL },
      },
      overdue: {
        eyes: { bottom: 21, left: 20, leftRight: 29, width: 6, height: 7, radius: PILL },
        mouth: { bottom: 13, left: 23, width: 8, height: 7, radius: PILL },
      },
      cheer: {
        eyes: {
          bottom: 22,
          left: 19,
          leftRight: 28,
          width: 8,
          height: 4,
          radius: PILL,
          rotate: 14,
        },
        mouth: { bottom: 12, left: 20, width: 15, height: 9, radius: "0 0 15px 15px" },
      },
    },
  },
  sm: {
    width: 30,
    height: 38,
    flesh: { top: 4, side: 4, bottom: 4 },
    pit: { bottom: 6, left: 7, size: 16 },
    faces: {
      happy: {
        eyes: { bottom: 12, left: 10, leftRight: 16, width: 4, height: 5, radius: PILL },
        mouth: { bottom: 8, left: 12, width: 6, height: 4, radius: "0 0 6px 6px" },
      },
      soon: {
        eyes: { bottom: 12, left: 10, leftRight: 16, width: 4, height: 4, radius: PILL },
        mouth: { bottom: 9, left: 12, width: 6, height: 2, radius: PILL },
      },
      overdue: {
        eyes: { bottom: 12, left: 10, leftRight: 16, width: 4, height: 5, radius: PILL },
        mouth: { bottom: 7, left: 12, width: 6, height: 5, radius: PILL },
      },
      cheer: {
        eyes: {
          bottom: 13,
          left: 10,
          leftRight: 16,
          width: 4,
          height: 3,
          radius: PILL,
          rotate: 14,
        },
        mouth: { bottom: 7, left: 11, width: 8, height: 5, radius: "0 0 8px 8px" },
      },
    },
  },
};

const ANIMATION_CLASSES: Record<AvoAnimation, string> = {
  bob: "animate-bob",
  shake: "animate-shake",
  pop: "animate-pop",
  squish: "animate-squish",
  none: "",
};

type AvoProps = {
  size: AvoSize;
  mood: AvoMood;
  /** Ohne Angabe: `shake` bei `overdue`, sonst das ruhige `bob`. */
  animation?: AvoAnimation;
  /**
   * Fuer Flaechen, die in *beiden* Themes dunkel sind -- der Scanner und der
   * invertierte Toast. Im Dunkelmodus ist die helle Schale ohnehin der
   * Normalfall, dort aendert das Flag nichts.
   */
  onDark?: boolean;
  className?: string;
};

export function Avo({ size, mood, animation, onDark = false, className }: AvoProps) {
  const shape = SHAPES[size];
  const face = shape.faces[mood];
  const motion = animation ?? (mood === "overdue" ? "shake" : "bob");

  // Nur die offenen Augen blinzeln. Bei 4px Hoehe (sm) faellt ein Blinzeln
  // nicht mehr als Blinzeln auf, sondern als Flackern -- deshalb erst ab md.
  const blinks = (mood === "happy" || mood === "soon") && size !== "sm";

  const eye = (left: number, mirrored: boolean) => (
    <span
      className={cn("absolute bg-(--avo-face)", blinks && "animate-blink")}
      style={{
        bottom: face.eyes.bottom,
        left,
        width: face.eyes.width,
        height: face.eyes.height,
        borderRadius: face.eyes.radius,
        transform: face.eyes.rotate
          ? `rotate(${mirrored ? face.eyes.rotate : -face.eyes.rotate}deg)`
          : undefined,
      }}
    />
  );

  return (
    // aria-hidden, weil die Figur nichts sagt, was nicht daneben steht: die
    // Stimmung wird immer von einem Text begleitet ("Alles frisch.", "Zwei
    // Sachen sind drueber."). Ein Screenreader, der hier "Bild" ansagt,
    // unterbricht diesen Satz nur.
    <span
      aria-hidden
      className={cn("relative block shrink-0", ANIMATION_CLASSES[motion], className)}
      style={{ width: shape.width, height: shape.height }}
    >
      <span
        className="absolute inset-0"
        style={{
          borderRadius: BODY_RADIUS,
          background: onDark ? "var(--avo-shell-light)" : "var(--avo-shell)",
        }}
      />
      <span
        className="absolute bg-(--avo-flesh)"
        style={{
          top: shape.flesh.top,
          left: shape.flesh.side,
          right: shape.flesh.side,
          bottom: shape.flesh.bottom,
          borderRadius: BODY_RADIUS,
        }}
      />
      <span
        className="absolute rounded-full bg-(--avo-pit)"
        style={{
          bottom: shape.pit.bottom,
          left: shape.pit.left,
          width: shape.pit.size,
          height: shape.pit.size,
        }}
      />
      {eye(face.eyes.left, false)}
      {eye(face.eyes.leftRight, true)}
      {/* Die Zunge liegt *vor* dem Mund und ragt unten aus ihm heraus --
          deshalb steht sie hier hinter dem Mund im Markup und traegt oben
          runde, unten eckige Ecken. */}
      <span
        className="absolute bg-(--avo-face)"
        style={{
          bottom: face.mouth.bottom,
          left: face.mouth.left,
          width: face.mouth.width,
          height: face.mouth.height,
          borderRadius: face.mouth.radius,
        }}
      />
      {face.tongue ? (
        <span
          className="absolute bg-danger"
          style={{
            bottom: face.tongue.bottom,
            left: face.tongue.left,
            width: face.tongue.width,
            height: face.tongue.height,
            borderRadius: face.tongue.radius,
          }}
        />
      ) : null}
    </span>
  );
}

/**
 * Die Stimmung aus den Eimern, die Startseite und Vorrat ohnehin rechnen.
 *
 * Hier und nicht in home-overview.tsx, weil mehr als eine Stelle sie braucht
 * und die Reihenfolge der Abfragen die Aussage traegt: was drueber ist,
 * schlaegt was heute faellig ist. Andersherum meldete die Figur "Heute ist
 * was dran", waehrend im Vorrat drei Sachen verderben.
 */
export function moodForBuckets(buckets: { expired: number; soon: number }): AvoMood {
  if (buckets.expired > 0) return "overdue";
  if (buckets.soon > 0) return "soon";
  return "happy";
}
