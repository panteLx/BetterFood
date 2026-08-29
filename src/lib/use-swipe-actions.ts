"use client";

import { useRef, useState } from "react";

// Ab hier loest das Loslassen die Aktion aus; darunter federt die Karte
// zurueck. Der Wert liegt deutlich ueber der Schwelle, ab der die
// Beschriftung sichtbar wird -- wer die Aktion ausloest, hat vorher gelesen,
// welche es ist.
export const COMMIT_DISTANCE = 76;
export const REVEAL_DISTANCE = 24;
const MAX_DISTANCE = 130;
// Unterhalb dieser Bewegung war es ein Tippen, kein Wischen.
const TAP_TOLERANCE = 6;

/**
 * Die Wischgeste hinter Vorrats- und Archivzeile.
 *
 * Nur Zeiger-Eingaben mit Finger oder Stift: mit der Maus ist Ziehen keine
 * erwartbare Bedienung, und ein versehentlich gehaltener Klick wuerde einen
 * Artikel abhaken. Auf dem Desktop bleiben die Zeilen deshalb ruhig -- die
 * Aktionen stehen dort auf der Detailseite.
 */
export function useSwipeActions({
  onSwipeRight,
  onSwipeLeft,
  disabled = false,
}: {
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  disabled?: boolean;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const movedRef = useRef(0);

  return {
    offset,
    dragging,
    /** True, solange die letzte Bewegung als Wischen und nicht als Tippen zaehlt. */
    wasSwipe: () => Math.abs(movedRef.current) > TAP_TOLERANCE,
    handlers: {
      onPointerDown(event: React.PointerEvent<HTMLElement>) {
        if (disabled || event.pointerType === "mouse") return;
        startXRef.current = event.clientX;
        movedRef.current = 0;
        setDragging(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      },
      onPointerMove(event: React.PointerEvent<HTMLElement>) {
        if (!dragging) return;
        const delta = Math.max(
          -MAX_DISTANCE,
          Math.min(MAX_DISTANCE, event.clientX - startXRef.current),
        );
        movedRef.current = delta;
        setOffset(delta);
      },
      onPointerUp() {
        if (!dragging) return;
        const delta = movedRef.current;
        setDragging(false);
        setOffset(0);
        if (delta > COMMIT_DISTANCE) onSwipeRight();
        else if (delta < -COMMIT_DISTANCE) onSwipeLeft();
      },
      onPointerCancel() {
        if (!dragging) return;
        setDragging(false);
        setOffset(0);
        movedRef.current = 0;
      },
    },
  };
}
