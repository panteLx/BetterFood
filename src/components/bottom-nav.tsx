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
  // Der Pruef-Flow ist ein Ablauf mit eigenem Weiter-Knopf, keine
  // Bereichsseite -- die Leiste haette dort nichts zu markieren und naehme
  // dem Kalender den Platz weg.
  "/review",
];

// Unterseiten von "Mehr": die Leiste soll dort weiterhin "Mehr" markieren,
// nicht ins Leere zeigen.
const SETTINGS_PREFIXES = ["/settings", "/knowledge"];

// Ein Wert fuer beide: die fixierte Leiste und der Platzhalter, der ihr im
// Fluss den Platz freihaelt. 96px sind der Rahmen oben (pt-2) plus die Insel
// (2*py-3 + size-[46px] = 70px) plus der Rahmen unten (pb-[18px]). Laufen die
// auseinander, endet der Inhalt entweder unter der Insel oder ueber einer
// Luecke.
const NAV_BOX = "h-24";

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
        "flex size-[46px] items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        active ? "bg-primary-tint text-primary-deep" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5.5" strokeWidth={active ? 2.2 : 2} />
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
  // pb-[18px] sie gleichmaessig ein.
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
          "pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-md px-4 pt-2 pb-[18px] transition-[transform,opacity] duration-300 ease-out",
          hidden && "translate-y-full opacity-0",
        )}
      >
        {/* 28px Radius, keine Kante mehr: die Tiefe traegt jetzt allein
            shadow-nav (in .dark ein eigener Wert desselben Tokens, siehe
            globals.css), wie ueberall sonst im Redesign auch. bg-card/90 mit
            dark:bg-card/88 statt eines eigenen rgba-Werts, weil --card in
            beiden Themes exakt die Grundfarbe des Entwurfs ist (#fff bzw.
            #1c2620) -- nur die Deckkraft weicht zwischen den Themes leicht ab. */}
        <div className="pointer-events-auto flex items-center justify-between rounded-[28px] bg-card/90 px-3 py-3 shadow-nav backdrop-blur-[20px] dark:bg-card/88">
          {LEFT_ITEMS.map((item) => (
            <NavLink key={item.href} {...item} active={isActive(item.href)} />
          ))}
          {/* -mt-3.5 (-14px): der Knopf ueberragt die Insel wieder, wie vor
              der ersten Fassung dieser Leiste -- jetzt aber mit einem
              Boden unter sich, auf dem er sichtbar aufliegt.

              animate-squish nur hier, nicht in der Komponente selbst: die
              Keyframes setzen `transform` direkt statt ueber die
              Tailwind-eigenen --tw-translate/--tw-scale-Variablen, und
              wuerden sonst mit dem Ein-/Ausblenden des freistehenden FAB
              weiter unten kollidieren (der animiert translate-y und scale
              fuer denselben Knopf). 3,4s statt der Standarddauer, weil der
              Entwurf den Knopf hier ruhiger pulsen laesst als z. B. die
              Zeile "Abgelaufen". */}
          <AddActionSheet className="-mt-3.5 animate-squish [animation-duration:3.4s]" />
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
            "pointer-events-auto transition-[transform,opacity] duration-300 ease-out",
            !hidden && "pointer-events-none translate-y-4 scale-90 opacity-0",
          )}
        />
      </div>
    </>
  );
}
