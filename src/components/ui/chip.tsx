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
        "inline-flex h-[34px] shrink-0 items-center justify-center rounded-xl border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground",
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
        "h-10 flex-1 rounded-[13px] border text-[13px] font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-transparent bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground",
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
      className={cn("flex gap-1 rounded-[15px] border border-border bg-surface-2 p-1", className)}
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
        "h-9 flex-1 rounded-[11px] text-[13.5px] font-bold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "bg-card text-foreground shadow-card" : "text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
