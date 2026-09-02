import { cn } from "@/lib/utils";

/**
 * Ein eigenes Piktogramm je Standardkategorie. Der Vorrat besteht aus kurzen,
 * sich ähnelnden Namen -- das Symbol macht eine Zeile auf einen Blick
 * unterscheidbar, lange bevor man den Text gelesen hat.
 *
 * Bewusst nur über den Kategorie-Key: Nutzer dürfen Kategorien frei anlegen,
 * und für einen selbst erdachten Key gibt es kein Symbol. Der Fallback
 * (Kiste) ist deshalb kein Ausnahmefall, sondern der Normalfall für alles
 * Selbstangelegte.
 *
 * Jeder Eintrag ist ein einzelner Pfad auf 24x24, nur Kontur, damit er bei
 * 16 px noch lesbar bleibt. "Wurst & Aufschnitt" ist deshalb eine Scheibe mit
 * drei Speck-Punkten und keine Wurst im Profil: eine liegende Wurstform wäre
 * bei dieser Größe kaum vom Fisch-Oval von "Fleisch & Fisch" zu
 * unterscheiden. "Süßwaren & Snacks" ist ein eingewickeltes Bonbon -- eine
 * Schokoladentafel wäre ein Rechteck mit Innenlinien und damit fast das
 * Karton-Symbol von "Sonstiges".
 */
const CATEGORY_PATHS: Record<string, string> = {
  milchprodukte: "M8 2h8M9 2v3.2L6 10v11a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10l-3-4.8V2",
  fleisch_fisch: "M2 12c5-6.5 13-6.5 18 0-5 6.5-13 6.5-18 0Zm14-1.4v.01",
  wurst_aufschnitt:
    "M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 1 0 0-17M9.4 9.6v.01M14.4 11.2v.01M11.4 14.8v.01",
  obst_gemuese: "M4 20C4 10.5 10.5 4 20 4c0 9.5-6.5 16-16 16Zm3.5-3.5 8-8",
  brot_backwaren: "M5 10.5a4 4 0 0 1 4-4h6a4 4 0 0 1 0 8v5.5H9v-5.5a4 4 0 0 1-4-4Z",
  kuehlware_sonstig: "M6 2.5h12v19H6zM6 10h12M9.2 6v2M9.2 14v3",
  tiefkuehl: "M12 2.5v19M4 7.5l16 9M20 7.5l-16 9",
  konserven:
    "M6 6.5c0-1.1 2.7-2 6-2s6 .9 6 2v13c0 1.1-2.7 2-6 2s-6-.9-6-2ZM6 6.5c0 1.1 2.7 2 6 2s6-.9 6-2",
  trockenwaren: "M9 2.5h6v3l2.5 3.5v10a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2V9L9 5.5Z",
  suesswaren_snacks:
    "M9 12a3 3 0 1 0 6 0 3 3 0 1 0-6 0M9.6 10.1 4.6 7.2v9.6l5-2.9M14.4 10.1l5-2.9v9.6l-5-2.9",
  getraenke: "M9.5 2.5h5v3.2l2 3.3v10.5a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V9l2-3.3ZM7.5 13h9",
  sonstiges: "M3 8.2 12 3.2l9 5v7.6l-9 5-9-5ZM3 8.2l9 5 9-5M12 13.2v9.6",
};

const FALLBACK_PATH = CATEGORY_PATHS.sonstiges;

export function categoryIconPath(categoryKey: string): string {
  return CATEGORY_PATHS[categoryKey] ?? FALLBACK_PATH;
}

export function CategoryIcon({
  categoryKey,
  className,
  strokeWidth = 1.7,
}: {
  categoryKey: string;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("size-5.5", className)}
    >
      <path d={categoryIconPath(categoryKey)} />
    </svg>
  );
}
