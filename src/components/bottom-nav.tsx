"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Home, List, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddActionSheet } from "@/components/add-action-sheet";

// Start und Vorrat beantworten zwei verschiedene Fragen ("was ist dringend?"
// und "was habe ich?") und sind deshalb zwei Ziele. Die Datenbank ist keins
// mehr: sie wird ein paar Mal im Jahr angefasst und steht jetzt unter "Mehr",
// wo auch Erinnerungen, Darstellung und Listen liegen.
const LEFT_ITEMS = [
  { href: "/", label: "Start", icon: Home },
  { href: "/inventory", label: "Vorrat", icon: List },
] as const;
const RIGHT_ITEMS = [
  { href: "/archive", label: "Archiv", icon: Archive },
  { href: "/settings", label: "Mehr", icon: SlidersHorizontal },
] as const;

// Seiten, die den Bildschirm fuer sich beanspruchen: Anmeldung und
// Registrierung haben noch keine Session, Kamera und Formulare haben ihre
// eigene, seitenspezifische Fussleiste -- eine zweite darunter wuerde beide
// nur verkuerzen.
const HIDDEN_PREFIXES = [
  "/login",
  "/register",
  "/welcome",
  "/scan",
  "/scan-ean",
  "/confirm",
  "/add",
  "/edit",
  "/item",
  "/saved",
];

// Unterseiten von "Mehr": die Leiste soll dort weiterhin "Mehr" markieren,
// nicht ins Leere zeigen.
const SETTINGS_PREFIXES = ["/settings", "/knowledge"];

function NavLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-1.5 text-[10.5px] font-semibold",
        active ? "text-primary" : "text-faint",
      )}
    >
      <Icon className="size-5.5" strokeWidth={1.8} />
      {label}
    </Link>
  );
}

// usePathname() liest die aktuelle URL und blockiert damit bei
// cacheComponents:true das statische Prerendering des Layouts (siehe
// node_modules/next/dist/docs Fehlermeldung "blocking-prerender-client-hook").
// Deshalb steckt BottomNav im Layout hinter einem <Suspense> -- gerendert wird
// sie ohnehin nur fuer angemeldete Nutzer (siehe BottomNavGate).
export function BottomNav() {
  const pathname = usePathname();

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/settings") return SETTINGS_PREFIXES.some((p) => pathname.startsWith(p));
    return pathname.startsWith(href);
  }

  // pb als max(...), nicht als Summe: der Home-Indikator-Inset ist auf dem
  // Geraet schon 34px, und zusammen mit einem eigenen Abstand stand die
  // Leiste ueber einer leeren Handbreit Flaeche. Der Wert im max() ist nur
  // der Ersatz fuer den Browser-Tab, wo der Inset 0 ist.
  return (
    <nav className="sticky bottom-0 z-30 flex shrink-0 items-start justify-between border-t border-border bg-card px-2.5 pt-2.5 pb-[max(env(safe-area-inset-bottom),1.25rem)]">
      <div className="flex flex-1">
        {LEFT_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </div>
      {/* Fester Freiraum in der Mitte statt gleichmaessiger Aufteilung: der
          Hinzufuegen-Knopf ragt ueber die Leiste hinaus und muss exakt
          zentriert sitzen, unabhaengig davon, wie breit die Labels ausfallen. */}
      <div className="w-[74px] shrink-0" aria-hidden="true" />
      <div className="flex flex-1">
        {RIGHT_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-0 -top-6 flex justify-center">
        <div className="pointer-events-auto">
          <AddActionSheet />
        </div>
      </div>
    </nav>
  );
}
