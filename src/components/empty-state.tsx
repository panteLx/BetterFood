import type { LucideIcon } from "lucide-react";
import { Avo } from "@/components/avo";
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
 *
 * `mascot` ersetzt das Icon-Quadrat durch Avo (leerer Vorrat) -- als eigener
 * Schalter statt einer Vereinigung mit `icon`, weil jeder bestehende Aufrufer
 * weiterhin nur `icon` uebergibt und keiner beides braucht.
 */
export function EmptyState({
  icon: Icon,
  mascot = false,
  title,
  body,
  action,
  tone = "muted",
  className,
}: {
  icon?: LucideIcon;
  mascot?: boolean;
  title: string;
  body: string;
  action?: React.ReactNode;
  tone?: "muted" | "primary";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4.5 rounded-3xl px-5 py-10 text-center",
        className,
      )}
    >
      {mascot ? (
        // bf-bob laeuft hier bewusst 4.2s statt der globalen 4s -- der Entwurf
        // taktet den leeren Vorrat eine Idee langsamer als das Kopfbereich-Avo.
        <Avo size="lg" mood="soon" className="[animation-duration:4.2s]" />
      ) : Icon ? (
        <span
          className={cn(
            "flex size-14.5 items-center justify-center rounded-[20px]",
            tone === "primary" ? "bg-primary-tint text-primary" : "bg-surface-2 text-faint",
          )}
        >
          <Icon className="size-7" strokeWidth={1.8} />
        </span>
      ) : null}
      <div>
        <p className="font-heading text-[22px] leading-[1.25] font-bold text-balance">{title}</p>
        <p className="mt-1.5 text-sm leading-relaxed font-semibold text-balance text-muted-foreground">
          {body}
        </p>
      </div>
      {action}
    </div>
  );
}
