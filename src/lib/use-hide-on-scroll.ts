"use client";

import { useEffect, useState } from "react";

// Ein Daumen haelt beim Lesen nie ganz still. Ohne Schwelle wechselte die
// Leiste bei jedem Zittern die Richtung und flackerte.
const MOVEMENT_THRESHOLD = 10;

// Ganz oben gibt es nichts zu verbergen: wer am Seitenanfang steht, hat noch
// nichts gelesen, was die Leiste verdecken wuerde.
const ALWAYS_VISIBLE_TOP = 64;

// Am Seitenende ist das nicht nur Komfort. Die Leiste haelt dort ihren Platz
// im Fluss (sticky, nicht fixed) -- eine versteckte hinterliesse einen leeren
// Streifen unter dem letzten Artikel.
const ALWAYS_VISIBLE_BOTTOM = 24;

/**
 * Meldet, ob gerade nach unten gelesen wird.
 *
 * Nach unten scrollen heisst "ich lese weiter" -- dabei ist die
 * Navigationsleiste nur eine Handbreit Bildschirm, die der Liste fehlt. Nach
 * oben scrollen heisst "ich suche etwas", und dann soll sie sofort wieder da
 * sein, ohne dass man erst ans Seitenende zurueckmuss.
 *
 * Die Richtung wird pro Frame ausgewertet, nicht pro Scroll-Event: das Event
 * feuert auf Mobilgeraeten ein Vielfaches der Bildwiederholrate, und jede
 * Auswertung liest mit scrollY/scrollHeight Werte, die den Browser zum
 * Neuberechnen des Layouts zwingen.
 */
export function useHideOnScrollDown() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    let frame = 0;

    function update() {
      frame = 0;
      // Auf iOS laeuft scrollY beim Ueberziehen ins Negative und ueber das
      // Seitenende hinaus -- ungeklemmt entstuende daraus eine Richtung, die
      // der Finger nie vorgegeben hat.
      const y = Math.max(0, window.scrollY);
      const doc = document.documentElement;
      const atBottom = y + window.innerHeight >= doc.scrollHeight - ALWAYS_VISIBLE_BOTTOM;

      if (y <= ALWAYS_VISIBLE_TOP || atBottom) {
        setHidden(false);
        lastY = y;
        return;
      }

      const delta = y - lastY;
      // Unter der Schwelle bleibt lastY absichtlich stehen: so summieren sich
      // viele winzige Bewegungen in dieselbe Richtung irgendwann zu einer
      // Entscheidung, statt einzeln verworfen zu werden.
      if (Math.abs(delta) < MOVEMENT_THRESHOLD) return;

      setHidden(delta > 0);
      lastY = y;
    }

    function onScroll() {
      if (frame) return;
      frame = requestAnimationFrame(update);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return hidden;
}
