"use client";

import { cn } from "@/lib/utils";

/**
 * Die beiden Auswahl-Formen des Designs.
 *
 * Chip: eine Option unter vielen, laeuft um (Kategorien, Schnell-Datumswahl).
 * Segment: eine Option unter genau wenigen, teilt sich die volle Breite
 * (Alle / Bald fällig / Abgelaufen).
 *
 * Beide sind bewusst keine Button-Varianten: sie tragen einen
 * Auswahl-Zustand, kein Aktions-Gewicht, und brauchen deshalb aria-pressed
 * statt eines optisch aehnlichen, semantisch falschen Buttons.
 *
 * Voll rund und nicht 10-13px wie bisher: der Entwurf trennt Flaechen, die
 * *ausgewaehlt* werden, von Flaechen, die etwas *enthalten*. Karten, Zeilen
 * und Blaetter tragen weiterhin gemaessigte Radien um --radius herum; Chips,
 * Pillen, Zaehler und Rundknoepfe sind vollstaendig rund. Ein Chip mit 12px
 * Radius sitzt in dieser Palette wie ein kleiner Knopf, kein Etikett.
 */
export function Chip({
  active,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-[34px] shrink-0 items-center justify-center rounded-full px-3.5 font-heading text-[13px] font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "bg-primary-tint text-primary-deep"
          : "bg-card text-muted-foreground shadow-row",
        className,
      )}
      {...props}
    />
  );
}

export function Segment({
  active,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "h-10 flex-1 rounded-full font-heading text-[13px] font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "bg-(image:--gradient-primary) text-primary-foreground shadow-cta"
          : "bg-card text-muted-foreground shadow-row",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Reiter-Leiste auf gefuelltem Grund (Datenbank: Produkte / Kategorien /
 * Orte). Der aktive Reiter hebt sich als Karte ab, statt sich einzufaerben --
 * er benennt einen Bereich, er waehlt keinen Filter.
 */
export function TabBar({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="tablist"
      className={cn("flex gap-1 rounded-full bg-surface-2 p-1", className)}
      {...props}
    />
  );
}

export function Tab({
  active,
  className,
  ...props
}: React.ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={cn(
        "h-9 flex-1 rounded-full font-heading text-[13.5px] font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "bg-card text-foreground shadow-row" : "text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
