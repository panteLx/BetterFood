"use client";

import { Check } from "lucide-react";
import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";

/**
 * Zwei Vorschaukarten statt dreier Textknöpfe.
 *
 * "Hell / Dunkel / System" nebeneinander ließ offen, wie das Ergebnis
 * aussieht — gerade bei einem dunklen Modus, der bewusst kein reines
 * Schwarz verwendet. Die Systemeinstellung ist deshalb keine dritte
 * gleichwertige Option mehr, sondern ein Schalter darunter: sie ist kein
 * eigenes Aussehen, sondern die Entscheidung, sie jemand anderem zu
 * überlassen.
 *
 * Die Vorschau ist eine Miniatur der eigenen Oberfläche und muss deshalb
 * *diese* Formensprache zeigen -- Rand als getönter Schatten statt Linie,
 * die angehobenen Radien, der Verlauf auf der Primärfläche. Sonst bewirbt
 * der Umschalter ein Aussehen, das die App gar nicht mehr hat.
 *
 * Die Werte unten sind Kopien aus globals.css und müssen mit jeder
 * Palettenänderung mitgezogen werden — sie stehen hier als Literale, weil
 * die Vorschau beide Paletten gleichzeitig zeigt und deshalb keine der
 * beiden über die Tokens des gerade aktiven Modus beziehen kann. Aus
 * demselben Grund steht der Vorschau-Schatten hier als `boxShadow`-Literal
 * und nicht als Utility-Klasse: `shadow-row` löst sich mit dem aktiven
 * Theme auf, aber der helle und der dunkle Kachel-Schatten müssen
 * gleichzeitig sichtbar sein.
 */
const THEMES = [
  {
    value: "light",
    label: "Hell",
    background: "#eef8ef",
    card: "#ffffff",
    accent: "linear-gradient(160deg, #4fd48c, #23a862)",
    tint: "#d5f4e2",
    tintInk: "#1c8f52",
    previewShadow: "0 6px 16px rgba(22, 48, 42, .08)",
  },
  {
    value: "dark",
    label: "Dunkel",
    background: "#131a16",
    card: "#1c2620",
    accent: "linear-gradient(160deg, #6fe09d, #3fbd7a)",
    tint: "#1e3b2b",
    tintInk: "#4fd48c",
    previewShadow: "inset 0 1px 0 rgba(255, 255, 255, .06), 0 6px 16px rgba(0, 0, 0, .3)",
  },
] as const;

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useIsClient();

  const followsSystem = theme === "system";
  const active = mounted ? (resolvedTheme ?? "light") : null;

  return (
    <div className="flex flex-col gap-4.5">
      <div className="flex gap-3">
        {THEMES.map((option) => {
          const selected = active === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setTheme(option.value)}
              className={cn(
                "flex flex-1 flex-col items-center gap-3 rounded-[24px] p-3.5 outline-none transition-shadow focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "bg-primary-tint shadow-card" : "bg-card shadow-row",
              )}
            >
              <span
                className="relative flex h-26 w-full flex-col gap-1.5 rounded-[18px] p-2.5"
                style={{ background: option.background, boxShadow: option.previewShadow }}
              >
                <span className="h-6 rounded-[10px]" style={{ background: option.accent }} />
                <span className="h-3.5 rounded-[7px]" style={{ background: option.card }} />
                <span
                  className="h-3.5 w-[70%] rounded-[7px]"
                  style={{ background: option.card }}
                />
                {selected && (
                  <span
                    className="absolute top-2 right-2 flex size-5 items-center justify-center rounded-full"
                    style={{ background: option.tint }}
                  >
                    <Check
                      className="size-3"
                      style={{ color: option.tintInk }}
                      strokeWidth={3}
                    />
                  </span>
                )}
              </span>
              <span className="font-heading text-sm font-bold">{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 rounded-[24px] bg-card px-4 py-3.5 shadow-row">
        <div className="min-w-0 flex-1">
          <p className="font-heading text-[15px] font-bold">Systemeinstellung folgen</p>
          <p className="mt-0.5 text-[12.5px] leading-snug font-medium text-muted-foreground">
            Wechselt automatisch mit dem Gerät
          </p>
        </div>
        <Switch
          checked={mounted ? followsSystem : false}
          onCheckedChange={(value) =>
            setTheme(value ? "system" : (resolvedTheme ?? "light"))
          }
          aria-label="Systemeinstellung folgen"
        />
      </div>
    </div>
  );
}
