import { cn } from "@/lib/utils";

/**
 * Das Namensfeld im Umbenennen-Zustand einer Zeile (Produkte, Kategorien,
 * Orte, Faecher).
 *
 * Der Ring ist hier dauerhaft an und nicht erst im Fokus: die Zeile *ist*
 * gerade im Bearbeiten-Modus, und ohne die Umrandung sah sie aus wie jede
 * andere. Ein Rand statt eines Rings hatte die Zeile um 1,5px wachsen
 * lassen und die Nachbarn verschoben.
 *
 * Als eigener Baustein, weil knowledge-manager und sorting-manager dieselbe
 * Zeile zeigen und die Klassenkette bis zum Frischling-Umbau zweimal
 * wortgleich dastand.
 */
export function RenameInput({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10.5 min-w-0 flex-1 rounded-lg bg-surface-2 px-3 font-heading text-[14.5px] font-bold ring-[1.5px] ring-primary ring-inset outline-none",
        className,
      )}
      {...props}
    />
  );
}
