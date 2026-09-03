"use client";

import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Der Auswahlknopf, der ein Blatt oeffnet: Symbol, aktueller Wert, Pfeil.
 *
 * Bewusst ein Blatt statt eines Dropdowns pro Zeile -- bei zehn Kategorien
 * und fuenfzig Zeilen waeren das fuenfzig Popups im Baum. Und bewusst hier
 * statt lokal in einer Seite: Wissensdatenbank, Kategorienliste und der
 * Rechnungsimport stellen dieselbe Frage ("wohin gehoert das?") und muessen
 * dabei gleich aussehen.
 */
export function PickerButton({
  icon: Icon,
  label,
  muted = false,
  disabled,
  onClick,
  className,
  "aria-label": ariaLabel,
}: {
  icon: LucideIcon;
  label: string;
  /** Fuer "Kein Ort" -- ein fehlender Wert soll nicht wie ein gewaehlter aussehen. */
  muted?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  "aria-label": string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[16px] bg-surface-2 px-3.5 text-left shadow-row outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
        className,
      )}
    >
      <Icon className="size-4 shrink-0 text-faint" strokeWidth={1.9} />
      <span
        className={cn(
          "min-w-0 flex-1 truncate font-heading text-sm font-bold",
          muted && "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <ChevronDown className="size-4 shrink-0 text-faint" strokeWidth={2.2} />
    </button>
  );
}

/** Eine Zeile in einem Auswahl-Blatt. */
export function PickerOption({
  label,
  hint,
  selected,
  onClick,
}: {
  label: string;
  /** Zweite Zeile in kleiner Schrift, etwa die Haltbarkeit einer Kategorie. */
  hint?: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-13 items-center gap-3 rounded-[20px] px-4 text-left font-heading text-[15px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        selected ? "bg-primary-tint text-primary-deep" : "bg-surface-2",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint && (
          <span
            className={cn(
              "mt-0.5 block truncate text-[12px] font-medium",
              selected ? "opacity-70" : "text-muted-foreground",
            )}
          >
            {hint}
          </span>
        )}
      </span>
      {selected && <Check className="size-5 shrink-0" strokeWidth={2.4} />}
    </button>
  );
}
