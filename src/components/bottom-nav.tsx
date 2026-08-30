"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Home, List, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useHideOnScrollDown } from "@/lib/use-hide-on-scroll";
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
  "/receipt",
];

// Unterseiten von "Mehr": die Leiste soll dort weiterhin "Mehr" markieren,
// nicht ins Leere zeigen.
const SETTINGS_PREFIXES = ["/settings", "/knowledge"];

// Ein Wert fuer beide: die fixierte Leiste und der Platzhalter, der ihr im
// Fluss den Platz freihaelt. 88px sind der Rahmen oben (pt-2) plus die Insel
// (2*py-2.5 + size-11 = 64px) plus der Rahmen unten (pb-4). Laufen die
// auseinander, endet der Inhalt entweder unter der Insel oder ueber einer
// Luecke.
const NAV_BOX = "h-22";

// Ohne Beschriftung traegt das Icon die Bedeutung allein -- fuer alles, was
// nicht sehend bedient wird, muss sie deshalb im aria-label stehen. title
// gibt sie am Zeiger zusaetzlich als Tooltip aus.
//
// Die aktive Seite bekommt ein gefuelltes Feld hinter dem Icon, nicht nur
// eine andere Farbe: auf einer Leiste aus fuenf gleich grossen Symbolen ist
// ein Farbunterschied allein zu leise, und die gefuellte Flaeche wiederholt
// zugleich die Form des Hinzufuegen-Knopfes daneben.
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
      aria-label={label}
      title={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex size-11 items-center justify-center rounded-[13px] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "bg-primary-tint text-primary" : "text-faint",
      )}
    >
      <Icon className="size-5.5" strokeWidth={active ? 2.1 : 1.8} />
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
  // Beide Hooks vor dem fruehen Return: React verlangt bei jedem Rendern
  // dieselbe Reihenfolge, und auf den Vollbildseiten wuerde sonst einer
  // ausfallen.
  const hidden = useHideOnScrollDown();

  if (HIDDEN_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return null;

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    if (href === "/settings") return SETTINGS_PREFIXES.some((p) => pathname.startsWith(p));
    return pathname.startsWith(href);
  }

  // Die Leiste steht als schwebende Insel ueber dem Inhalt, nicht als Band an
  // der Fensterkante -- waehrend des Scrollens laeuft der Inhalt hinter ihr
  // durch, und genau das macht die Transparenz sichtbar.
  //
  // fixed plus ein Platzhalter im Fluss, nicht sticky. Sticky war die
  // kuerzere Fassung (das <nav> haelt seinen Platz selbst, kein Platzhalter
  // noetig), scheiterte aber am Wegfahren: ein per transform verschobenes
  // Element bleibt im Fluss und vergroessert dabei die scrollbare Flaeche des
  // Dokuments. Die Seite wurde beim Verstecken also um die Leistenhoehe
  // laenger, man scrollte ins Leere, und am Ende dieses Leerraums holte die
  // "unten immer sichtbar"-Regel die Insel zurueck -- ein Loch von einer
  // Handbreit unter dem letzten Artikel. Ein fixed positioniertes Element
  // zaehlt nicht zur scrollbaren Flaeche, damit bleibt die Dokumenthoehe
  // konstant, egal ob die Leiste da ist oder nicht.
  //
  // Der Platzhalter behaelt seine Hoehe auch bei weggefahrener Leiste: eine
  // Hoehe, die sich mit dem Ein- und Ausblenden aendert, verschoebe den
  // Inhalt unter dem Finger.
  //
  // Kein env(safe-area-inset-bottom): der Inset reserviert Platz fuer den
  // Home-Indikator, damit Inhalt nicht unter ihm klebt -- eine Insel, die
  // ohnehin frei steht, braucht diese Reservierung nicht, sie haette ihren
  // eigenen Abstand nur auf 34px aufgeblasen. Stattdessen rahmen px-4 und
  // pb-4 sie gleichmaessig ein.
  //
  // inert statt nur unsichtbar: eine weggefahrene Leiste darf die
  // Tabulator-Reihenfolge nicht mehr belegen und von einem Screenreader nicht
  // mehr vorgelesen werden -- beides waere sonst ein Ziel, das niemand sieht.
  return (
    <>
      <div aria-hidden="true" className={cn(NAV_BOX, "shrink-0")} />

      <nav
        inert={hidden}
        className={cn(
          NAV_BOX,
          "pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md px-4 pt-2 pb-4 transition-[transform,opacity] duration-300 ease-out",
          hidden && "translate-y-full opacity-0",
        )}
      >
        {/* 22px Radius statt der vollen Pille: das ist dieselbe weiche
            Rechteckform, die der Hinzufuegen-Knopf und die Auswahl in seinem
            Sheet schon haben -- rund genug fuer eine Insel, eckig genug, um
            neben den Karten der App nicht wie ein Fremdkoerper zu wirken. */}
        <div className="pointer-events-auto flex items-center justify-between rounded-[22px] border border-border bg-card/85 px-3 py-2.5 shadow-nav backdrop-blur-xl">
          {LEFT_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
          <AddActionSheet />
          {RIGHT_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
        </div>
      </nav>

      {/* Der Knopf fuer die weggefahrene Leiste. Ebenfalls fixed, aus
          demselben Grund -- und er darf ohnehin keinen Platz im Fluss
          beanspruchen: er liegt ueber der Liste, waehrend sie unter ihm
          durchlaeuft. inset-x-0 + mx-auto + max-w-md heftet ihn auf breiten
          Fenstern an dieselbe Spalte wie den Inhalt, statt an den
          Bildschirmrand. */}
      <div
        inert={!hidden}
        className="pointer-events-none fixed inset-x-0 bottom-4 z-30 mx-auto flex w-full max-w-md justify-end px-4"
      >
        <AddActionSheet
          className={cn(
            "pointer-events-auto size-14 rounded-[18px] shadow-fab transition-[transform,opacity] duration-300 ease-out",
            !hidden && "pointer-events-none translate-y-4 scale-90 opacity-0",
          )}
        />
      </div>
    </>
  );
}
