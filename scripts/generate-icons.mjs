/**
 * Erzeugt saemtliche App-Icons aus einer einzigen Quelle: dem Blatt aus
 * `src/components/brand-mark.tsx`.
 *
 * Warum ein Skript und keine handgemalten PNGs: es gibt acht Groessen in drei
 * Zuschnitten (gerundet, maskable, monochrom), und sobald eine davon per Hand
 * nachgezogen wird, laufen sie auseinander. Hier steht die Geometrie einmal,
 * und `npm run icons` baut alles neu.
 *
 * Aufruf: `npm run icons` (braucht sharp aus den devDependencies sowie
 * ImageMagick fuer die .ico -- sharp kann kein ICO schreiben).
 */
import { execFileSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicIcons = path.join(root, "public", "icons");
const appDir = path.join(root, "src", "app");

// Der Primaerton aus globals.css, mit einem leichten Verlauf nach unten. Flach
// gefuellt wirkt ein 512er-Icon wie ein Platzhalter -- genau das war es vorher
// auch.
const GREEN_LIGHT = "#48885f";
const GREEN_DARK = "#2b5b3d";
const INK = "#ffffff";

// Das Blatt aus BrandMark, unveraendert. Sichtbar belegt es (inklusive halber
// Strichstaerke) rund 17.7 der 24 Einheiten, zentriert auf (12,12) -- daran
// haengt die Skalierung unten.
const LEAF = "M4 20C4 10.5 10.5 4 20 4c0 9.5-6.5 16-16 16Zm3.5-3.5 8-8";
const LEAF_SPAN = 17.7;

// Dasselbe Blatt ohne Mittelrippe und gefuellt statt gestrichen. Unterhalb von
// etwa 20px laufen Umriss und Rippe ineinander und das Zeichen wird zu einem
// Fleck -- an genau den Stellen (16er-Favicon, Android-Badge) steht deshalb
// die Silhouette.
const LEAF_SOLID = "M4 20C4 10.5 10.5 4 20 4c0 9.5-6.5 16-16 16Z";

// Die beiden Verknuepfungen aus dem Manifest brauchen ein eigenes Zeichen:
// zweimal dasselbe App-Icon im Kontextmenue unterscheidet nichts.
const SCAN =
  "M4 8V6a2 2 0 0 1 2-2h2 M16 4h2a2 2 0 0 1 2 2v2 M20 16v2a2 2 0 0 1-2 2h-2 M8 20H6a2 2 0 0 1-2-2v-2 M8 8v8 M12 8v8 M16 8v8";
const PLUS = "M12 5.5v13 M5.5 12h13";

/**
 * @param {object} spec
 * @param {number} spec.size          Kantenlaenge in px
 * @param {number} spec.markRatio     Anteil der Kante, den das Zeichen belegt
 * @param {number} [spec.radiusRatio] Eckenradius als Anteil der Kante
 * @param {number} [spec.strokeWidth] Strichstaerke im 24er-Raster
 * @param {string} [spec.glyph]       Pfad im 24er-Raster
 * @param {boolean} [spec.mono]       Weisses Zeichen auf transparentem Grund
 * @param {boolean} [spec.solid]      Zeichen fuellen statt streichen
 */
function iconSvg({
  size,
  markRatio,
  radiusRatio = 0,
  strokeWidth = 1.7,
  glyph = LEAF,
  mono = false,
  solid = false,
}) {
  const scale = (markRatio * size) / LEAF_SPAN;
  const offset = size / 2 - 12 * scale;
  const radius = radiusRatio * size;

  const background = mono
    ? ""
    : `<defs>
      <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
        <stop offset="0" stop-color="${GREEN_LIGHT}"/>
        <stop offset="1" stop-color="${GREEN_DARK}"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${background}
    <g transform="translate(${offset} ${offset}) scale(${scale})"
       ${
         solid
           ? `fill="${INK}"`
           : `fill="none" stroke="${INK}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`
       }>
      <path d="${glyph}"/>
    </g>
  </svg>`;
}

async function png(file, spec) {
  await sharp(Buffer.from(iconSvg(spec))).png({ compressionLevel: 9 }).toFile(file);
  console.log("  ", path.relative(root, file));
}

async function main() {
  await mkdir(publicIcons, { recursive: true });

  console.log("Manifest-Icons (any):");
  // "any" wird ungemaskt angezeigt -- Desktop-Chrome, Windows-Startmenue,
  // Aufgabenleiste. Die Rundung muss das Icon deshalb selbst mitbringen.
  for (const size of [192, 512]) {
    await png(path.join(publicIcons, `icon-${size}.png`), {
      size,
      markRatio: 0.5,
      radiusRatio: 0.225,
    });
  }

  console.log("Manifest-Icons (maskable):");
  // Android schneidet daraus eine beliebige Form (Kreis, Squircle, Tropfen)
  // und garantiert nur den inneren Kreis mit 80% Durchmesser. Also randlos
  // fuellen und das Zeichen klein genug halten, dass es dort hineinpasst:
  // 0.4 * sqrt(2) = 0.57 Diagonale, deutlich unter 0.8.
  for (const size of [192, 512]) {
    await png(path.join(publicIcons, `maskable-${size}.png`), {
      size,
      markRatio: 0.4,
      radiusRatio: 0,
    });
  }

  console.log("Verknuepfungen:");
  await png(path.join(publicIcons, "shortcut-scan-96.png"), {
    size: 96,
    markRatio: 0.52,
    radiusRatio: 0.225,
    strokeWidth: 1.9,
    glyph: SCAN,
  });
  await png(path.join(publicIcons, "shortcut-add-96.png"), {
    size: 96,
    markRatio: 0.46,
    radiusRatio: 0.225,
    strokeWidth: 2.2,
    glyph: PLUS,
  });

  console.log("Benachrichtigungen:");
  // Android faerbt das Badge auf eine einfarbige Silhouette ein: alles, was
  // nicht transparent ist, wird weiss. Ein gruenes Quadrat waere dort ein
  // grauer Klecks -- deshalb nur das Blatt, auf transparentem Grund.
  await png(path.join(publicIcons, "badge-96.png"), {
    size: 96,
    markRatio: 0.74,
    glyph: LEAF_SOLID,
    solid: true,
    mono: true,
  });

  console.log("App-Icons:");
  // apple-touch-icon: iOS rundet selbst und kennt keine Transparenz -- also
  // randlos und mit etwas mehr Luft als beim maskable, weil der Beschnitt
  // hier fest ist.
  await png(path.join(appDir, "apple-icon.png"), {
    size: 180,
    markRatio: 0.5,
    radiusRatio: 0,
  });

  // Das SVG ist das Favicon fuer alles, was es kann -- eine Datei, jede
  // Aufloesung. Das Zeichen sitzt hier groesser als im App-Icon, weil es im
  // Tab nur 16 bis 32px breit ankommt.
  await writeFile(
    path.join(appDir, "icon.svg"),
    iconSvg({ size: 512, markRatio: 0.66, radiusRatio: 0.225 }) + "\n",
  );
  console.log("   src/app/icon.svg");

  // favicon.ico bleibt fuer aeltere Browser und fuer Dienste, die stur
  // /favicon.ico anfragen. sharp schreibt kein ICO, deshalb ImageMagick.
  const tmp = [];
  for (const size of [16, 32, 48]) {
    const file = path.join(publicIcons, `.favicon-${size}.png`);
    // Der 16er bekommt die Silhouette, die groesseren das gestrichene Blatt.
    const spec =
      size === 16
        ? { markRatio: 0.62, glyph: LEAF_SOLID, solid: true }
        : { markRatio: 0.66 };
    await sharp(Buffer.from(iconSvg({ size: size * 16, radiusRatio: 0.225, ...spec })))
      // Aus dem 16-fachen heruntergerechnet statt direkt gerastert: das
      // Antialiasing wird dadurch spuerbar sauberer.
      .resize(size, size)
      .png()
      .toFile(file);
    tmp.push(file);
  }
  try {
    execFileSync("magick", [...tmp, path.join(appDir, "favicon.ico")], { stdio: "inherit" });
    console.log("   src/app/favicon.ico");
  } catch {
    console.warn("   favicon.ico uebersprungen -- ImageMagick (magick) nicht gefunden");
  }
  await Promise.all(tmp.map((file) => rm(file, { force: true })));
}

await main();
