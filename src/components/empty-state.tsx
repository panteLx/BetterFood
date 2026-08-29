import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Der leere Zustand, wie ihn das Design an fuenf Stellen zeigt: Symbol,
 * Ueberschrift, ein Satz Erklaerung -- und, wo es einen gibt, genau ein
 * naechster Schritt.
 *
 * Der Schritt ist der Punkt: die Startseite ohne Artikel bot vorher nur Text
 * an, waehrend die eigentliche Aktion im zentralen Knopf lag, den der Nutzer
 * auf dem allerersten Screen erst finden musste. Er kommt als fertiges
 * Element herein (heute immer AddItemButton), weil er ein Blatt oeffnet statt
 * zu navigieren -- ein Link kann das nicht.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  tone = "muted",
  className,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: React.ReactNode;
  tone?: "muted" | "primary";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3.5 rounded-3xl px-5 py-10 text-center",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-14.5 items-center justify-center rounded-[20px]",
          tone === "primary" ? "bg-primary-tint text-primary" : "bg-surface-2 text-faint",
        )}
      >
        <Icon className="size-7" strokeWidth={1.8} />
      </span>
      <div>
        <p className="text-[17px] leading-snug font-bold text-balance">{title}</p>
        <p className="mt-1.5 text-sm leading-relaxed font-medium text-balance text-muted-foreground">
          {body}
        </p>
      </div>
      {action}
    </div>
  );
}
