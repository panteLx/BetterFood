"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Archive, Settings, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AddActionSheet } from "@/components/add-action-sheet";

// "Scannen" und "Hinzufuegen" sind keine eigenen Nav-Ziele mehr, sondern ueber
// den zentralen AddActionSheet-Button erreichbar (siehe dort fuer die
// Begruendung). LEFT_ITEMS/RIGHT_ITEMS werden links bzw. rechts der zentralen
// Aktion gerendert.
const LEFT_ITEMS = [{ href: "/", label: "Start", icon: Home }] as const;
const RIGHT_ITEMS = [
  { href: "/archive", label: "Archiv", icon: Archive },
  { href: "/settings", label: "Einstellungen", icon: Settings },
] as const;

// Auf diesen Seiten gibt es (noch) keine Session bzw. keine Listen-gebundenen
// Ziele, daher macht eine Navigation zu Start/Archiv/Einstellungen dort keinen
// Sinn.
const HIDDEN_PREFIXES = ["/login", "/register"];

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
      className={cn(
        "flex flex-col items-center gap-0.5 px-3 py-2 text-xs",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}

// Der FAB-Button sitzt absolut zentriert ueber der Nav-Leiste, unabhaengig
// davon, wie viele Items links/rechts stehen (aktuell 1 links, 2 rechts) -
// eine gleichmaessige flex-1-Aufteilung wuerde ihn sonst sichtbar aus der
// Bildschirmmitte schieben. Der aeussere Wrapper ist pointer-events-none und
// deckt trotzdem die volle Breite ab (fuer die Zentrierung); nur der Button
// selbst bekommt pointer-events wieder zurueck, damit darunterliegende
// Nav-Items weiterhin klickbar bleiben.
function CenterAction() {
  return (
    <div className="pointer-events-none absolute inset-x-0 -top-6 flex justify-center">
      <div className="pointer-events-auto">
        <AddActionSheet />
      </div>
    </div>
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
    return href === "/" ? pathname === "/" : pathname.startsWith(href);
  }

  return (
    <nav className="sticky bottom-0 z-30 flex shrink-0 items-center border-t bg-background pb-[env(safe-area-inset-bottom)]">
      <div className="flex flex-1 justify-evenly">
        {LEFT_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </div>
      <div className="flex flex-1 justify-evenly">
        {RIGHT_ITEMS.map((item) => (
          <NavLink key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </div>
      <CenterAction />
    </nav>
  );
}
