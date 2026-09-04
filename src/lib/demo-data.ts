/**
 * Der Vorrat, den die Demo unter /demo zeigt.
 *
 * Acht Artikel und ein knappes Archiv, beides fest verdrahtet und rein
 * lesend. Es gibt bewusst keinen lokalen Speicher und keine Übernahme bei der
 * Registrierung: die Demo beantwortet die Frage "wie sieht das aus, wenn es
 * benutzt wird?", nicht "kann ich hier schon anfangen?". Der volle Demo-Modus
 * mit Schreibzugriff ist ein eigener Branch.
 *
 * Alles Datumsabhängige entsteht **relativ zu einem hereingereichten
 * Stichtag** und nie über ein eigenes new Date(). Zwei Gründe, beide bekannt
 * aus diesem Repo:
 *
 *  - new Date() im Server-Render ist unter cacheComponents:true ein
 *    "unstable value" und bricht den Prerender der Route ab (siehe
 *    useIsClient und den Kommentar an computeArchiveStats).
 *  - Ein fest eingetragenes Datum wäre eine Woche nach dem Deploy schlicht
 *    falsch: die Demo lebt davon, dass "Heute" auch heute heißt und alle
 *    drei Ablauf-Zustände gleichzeitig vorkommen.
 *
 * Die Kategorien kommen aus DEFAULT_CATEGORIES statt aus einer eigenen Liste.
 * Damit rechnet die Demo mit exakt denselben Schätzwerten wie eine frisch
 * angelegte Liste -- eine zweite, gepflegte Tabelle wäre nach der ersten
 * Preisanpassung auseinandergelaufen.
 */

import { addDays } from "@/lib/expiry";
import { DEFAULT_CATEGORIES, DEFAULT_PLACES } from "@/lib/categories";
import { DEFAULT_MONTHLY_GOAL } from "@/lib/monthly-goal";
import type { ResolvedEntry } from "@/lib/stats";
import type { SuggestionView } from "@/components/recipe-suggestions";
import type { RecipeBudget } from "@/lib/recipes";
import type { Item } from "@/db/schema";

/** Die Demo kennt genau eine Liste; der Listenwechsel ist ohnehin gesperrt. */
export const DEMO_LIST_ID = 1;
export const DEMO_LIST_NAME = "Zuhause";

/** Der Vorname in der Begrüßung. Kein echter Name, aber auch kein "du, du". */
export const DEMO_USER_NAME = "Gast";

export const DEMO_MONTHLY_GOAL = DEFAULT_MONTHLY_GOAL;

/** Die drei Standardfächer, mit fortlaufenden IDs wie in einer echten Liste. */
export const DEMO_PLACES = DEFAULT_PLACES.map((name, index) => ({
  id: index + 1,
  name,
}));

const placeId = (name: (typeof DEFAULT_PLACES)[number]) =>
  DEMO_PLACES.find((place) => place.name === name)!.id;

/**
 * Kategorien samt Schätzwerten -- die Hero-Karte rechnet aus ihnen die
 * Ersparnis. Ohne avgPriceCents/avgCo2Grams stünde dort der Hinweis
 * "Schätzwerte ergänzen", und der führt in der Demo nirgendwohin.
 */
export const DEMO_CATEGORIES = DEFAULT_CATEGORIES.map((category) => ({
  key: category.key,
  label: category.label,
  avgPriceCents: category.avgPriceCents as number | null,
  avgCo2Grams: category.avgCo2Grams as number | null,
}));

export const DEMO_LISTS = [
  { id: DEMO_LIST_ID, name: DEMO_LIST_NAME, itemCount: 8, memberCount: 2 },
];

/**
 * Die acht Artikel, gestaffelt über alle Eimer von EXPIRY_BUCKETS.
 *
 * expiryInDays ist der Abstand zum Stichtag: zwei abgelaufene, einer heute,
 * einer morgen, zwei in dieser Woche, zwei später. Damit kommen alle drei
 * Zustände aus expiryStatus (expired / soon / fresh) gleichzeitig vor, die
 * Startseite zeigt vier gefüllte Abschnitte, und die Segmentleiste unter der
 * Hero-Karte hat in allen drei Farben etwas zu zeigen.
 *
 * Die Namen sind absichtlich gewöhnlich. Eine Demo, die "Trüffelbutter" und
 * "Yuzu-Paste" zeigt, beschreibt einen anderen Haushalt als den, der sie
 * gerade ansieht.
 */
const DEMO_ITEM_SEEDS = [
  {
    name: "Vollmilch 3,5 %",
    category: "milchprodukte",
    place: "Kühlschrank",
    quantity: 1,
    expiryInDays: -2,
  },
  {
    name: "Hähnchenbrust",
    category: "fleisch_fisch",
    place: "Kühlschrank",
    quantity: 1,
    expiryInDays: -1,
  },
  {
    name: "Naturjoghurt",
    category: "milchprodukte",
    place: "Kühlschrank",
    quantity: 2,
    expiryInDays: 0,
  },
  {
    name: "Blattspinat",
    category: "obst_gemuese",
    place: "Kühlschrank",
    quantity: 1,
    expiryInDays: 1,
  },
  {
    name: "Vollkornbrot",
    category: "brot_backwaren",
    place: "Vorratsschrank",
    quantity: 1,
    expiryInDays: 3,
  },
  {
    name: "Gouda am Stück",
    category: "kuehlware_sonstig",
    place: "Kühlschrank",
    quantity: 1,
    expiryInDays: 6,
  },
  {
    name: "Erbsen tiefgekühlt",
    category: "tiefkuehl",
    place: "Gefrierfach",
    quantity: 2,
    expiryInDays: 45,
  },
  {
    name: "Passierte Tomaten",
    category: "konserven",
    place: "Vorratsschrank",
    quantity: 3,
    expiryInDays: 210,
  },
] as const;

/**
 * Das Archiv hinter den Zahlen der Hero-Karte: Rettungsquote, Serie,
 * Ersparnis und Abzeichen kommen ausschließlich aus abgehakten Artikeln.
 *
 * Die beiden weggeworfenen Einträge liegen 12 und 26 Tage zurück. Das ist
 * kein Zufall: der jüngere setzt die Tagesserie auf 12 (eine Zahl, die nach
 * Gewohnheit aussieht, nicht nach Zufall), und beide zusammen halten die
 * Quote in der Monatsmitte bei rund 93 % -- knapp über dem Monatsziel von
 * 90 %, damit die Leiste voll ist und das Abzeichen "Monatsziel" erreicht.
 *
 * Am Monatsersten schrumpft das Fenster auf einen einzigen Tag: dann zeigt
 * die Karte 100 % aus einem gerechneten Artikel. Das ist untertrieben, aber
 * wahr -- und allemal besser als ein eingefrorenes Datum, das behauptet, es
 * sei immer der 15.
 */
const DEMO_ARCHIVE_SEEDS: {
  daysAgo: number;
  status: "used" | "thrown_away";
  quantity: number;
  category: string;
}[] = [
  { daysAgo: 0, status: "used", quantity: 1, category: "obst_gemuese" },
  { daysAgo: 1, status: "used", quantity: 2, category: "milchprodukte" },
  { daysAgo: 2, status: "used", quantity: 1, category: "brot_backwaren" },
  { daysAgo: 3, status: "used", quantity: 1, category: "kuehlware_sonstig" },
  { daysAgo: 5, status: "used", quantity: 1, category: "fleisch_fisch" },
  { daysAgo: 6, status: "used", quantity: 2, category: "obst_gemuese" },
  { daysAgo: 8, status: "used", quantity: 1, category: "milchprodukte" },
  { daysAgo: 9, status: "used", quantity: 1, category: "getraenke" },
  { daysAgo: 11, status: "used", quantity: 1, category: "trockenwaren" },
  { daysAgo: 12, status: "thrown_away", quantity: 1, category: "obst_gemuese" },
  { daysAgo: 13, status: "used", quantity: 2, category: "obst_gemuese" },
  { daysAgo: 15, status: "used", quantity: 1, category: "milchprodukte" },
  { daysAgo: 17, status: "used", quantity: 1, category: "konserven" },
  { daysAgo: 19, status: "used", quantity: 1, category: "brot_backwaren" },
  { daysAgo: 21, status: "used", quantity: 2, category: "obst_gemuese" },
  { daysAgo: 24, status: "used", quantity: 1, category: "tiefkuehl" },
  { daysAgo: 26, status: "thrown_away", quantity: 1, category: "kuehlware_sonstig" },
  { daysAgo: 28, status: "used", quantity: 1, category: "fleisch_fisch" },
  { daysAgo: 31, status: "used", quantity: 2, category: "milchprodukte" },
  { daysAgo: 35, status: "used", quantity: 1, category: "obst_gemuese" },
  { daysAgo: 40, status: "used", quantity: 1, category: "trockenwaren" },
];

/**
 * Wie lange der Demo-Haushalt die App angeblich schon benutzt.
 *
 * Nur für items.addedAt gebraucht, das in der Oberfläche nirgends steht --
 * aber ein Artikel, der laut Datensatz nach seinem eigenen Ablaufdatum
 * eingetragen wurde, wäre eine Zeitbombe für jede spätere Ansicht, die es
 * doch einmal anzeigt.
 */
const DEMO_ADDED_DAYS_AGO = 4;

/** Die acht Artikel als vollwertige items-Zeilen, relativ zum Stichtag. */
export function buildDemoItems(now: Date): Item[] {
  const addedAt = addDays(-DEMO_ADDED_DAYS_AGO, now);
  return DEMO_ITEM_SEEDS.map((seed, index) => ({
    id: index + 1,
    name: seed.name,
    category: seed.category,
    barcode: null,
    placeId: placeId(seed.place),
    note: null,
    quantity: seed.quantity,
    addedAt,
    expiryDate: addDays(seed.expiryInDays, now),
    status: "active" as const,
    resolvedAt: null,
    hiddenAt: null,
    listId: DEMO_LIST_ID,
    addedById: null,
  }));
}

/**
 * Das Archiv in genau der Form, die computeArchiveStats, computeSavings und
 * computeBadges erwarten -- vier Felder, mehr braucht keine der drei.
 */
export function buildDemoResolvedEntries(now: Date): ResolvedEntry[] {
  return DEMO_ARCHIVE_SEEDS.map((seed) => ({
    status: seed.status,
    quantity: seed.quantity,
    // Lokale Mitternacht des jeweiligen Tages: startOfDay() und startOfWeek()
    // in stats.ts bilden ihre Schlüssel genauso, und die Serien zählen nur
    // dann richtig, wenn beide Seiten denselben Tagesanfang meinen.
    resolvedAt: addDays(-seed.daysAgo, now),
    category: seed.category,
  }));
}

/**
 * Ein Stapel Rezeptvorschläge, wie ihn die echte Seite nach einem Klick
 * zeigen würde.
 *
 * Fest hingeschrieben und nicht erzeugt: die Demo hat keinen Schlüssel, kein
 * Kontingent und keine Wartezeit -- sie soll zeigen, wie das Ergebnis
 * aussieht. Die drei Gerichte greifen bewusst auf den Demo-Vorrat zu, damit
 * die Zuordnung "verbraucht diesen Artikel" stimmt.
 *
 * Ihre Zusammensetzung ist ebenso gewählt und nicht geraten: In jeder Karte
 * stehen alle drei Sorten Pillen einmal nebeneinander -- gelb der ablaufende
 * Artikel, ruhig der Vorrat, der Zeit hat, und mit Korb das, was noch fehlt.
 * Das dritte Gericht kommt ganz ohne Ablaufendes aus und zeigt damit, dass
 * Konserve und Gefrierfach mitgedacht werden.
 */
const DEMO_RECIPE_SEEDS = [
  {
    emoji: "🍳",
    title: "Spinat-Frittata",
    description:
      "Bringt den Blattspinat von morgen weg und schmilzt den Gouda gleich mit hinein.",
    uses: ["Blattspinat", "Gouda am Stück"],
    buy: ["Eier", "Zwiebeln"],
    ingredients: [
      "1 Packung Blattspinat",
      "6 Eier",
      "100 g Gouda, gerieben",
      "1 Zwiebel",
      "Salz und Pfeffer",
    ],
    steps: [
      "Zwiebel würfeln und in der Pfanne glasig dünsten.",
      "Spinat dazugeben und zusammenfallen lassen, dann kräftig würzen.",
      "Eier verquirlen, über das Gemüse gießen und den Käse darüber verteilen.",
      "Zugedeckt bei kleiner Hitze 12 Minuten stocken lassen.",
    ],
  },
  {
    emoji: "🥣",
    title: "Joghurt-Dip mit Röstbrot",
    description: "Der Joghurt läuft heute ab – mit Minze und Zitrone wird er zum Dip fürs Brot.",
    uses: ["Naturjoghurt", "Vollkornbrot"],
    buy: ["Minze", "Zitrone", "Knoblauch"],
    ingredients: [
      "2 Becher Naturjoghurt",
      "4 Scheiben Vollkornbrot",
      "1 Handvoll Minze",
      "1 Zitrone",
      "1 Knoblauchzehe",
      "Olivenöl, Salz",
    ],
    steps: [
      "Joghurt mit gepresstem Knoblauch, Zitronenabrieb, Öl und Salz verrühren.",
      "Minze fein hacken und unterheben.",
      "Brot in Streifen schneiden und in der Pfanne goldbraun rösten.",
      "Dip 10 Minuten durchziehen lassen und lauwarm dazu servieren.",
    ],
  },
  {
    emoji: "🍅",
    title: "Ofen-Gnocchi mit Erbsen",
    description: "Räumt Konserve und Gefrierfach auf – dazu braucht es nur Gnocchi und Mozzarella.",
    uses: ["Passierte Tomaten", "Erbsen tiefgekühlt"],
    buy: ["Gnocchi", "Mozzarella", "Zwiebeln"],
    ingredients: [
      "500 g Gnocchi",
      "1 Packung passierte Tomaten",
      "200 g Erbsen, tiefgekühlt",
      "1 Kugel Mozzarella",
      "2 Zwiebeln, Olivenöl und Salz",
    ],
    steps: [
      "Zwiebeln würfeln, in Öl andünsten und die Tomaten dazugeben.",
      "Sauce 10 Minuten einkochen, kräftig salzen und die Erbsen unterrühren.",
      "Gnocchi roh in die Auflaufform geben, Sauce darüber, Mozzarella zerzupfen.",
      "Bei 200 °C 20 Minuten backen, bis der Käse Farbe hat.",
    ],
  },
];

/**
 * Das Budget, das die Demo anzeigt.
 *
 * Volle Stunde, voller Tag: Der Knopf soll dort aussehen wie beim ersten
 * eigenen Besuch, und "noch 4 Vorschläge frei" wäre eine Zahl, die aus einer
 * Benutzung stammt, die es in der Demo nicht gab. Angefasst wird er ohnehin
 * nicht -- DemoSurface fängt den Klick ab, bevor die Rückfrage aufgeht.
 *
 * Die Zahlen stehen hier als Literale und nicht als Import von
 * MAX_BATCHES_PER_HOUR: lib/recipes.ts beginnt mit `import "server-only"`, und
 * diese Datei landet über /demo im Browser-Bundle. Ein Typ-Import ist
 * unbedenklich (er verschwindet beim Übersetzen), ein Wert-Import zöge das
 * ganze Modul mit. Laufen die beiden Stellen auseinander, sagt die Demo eine
 * Zahl zu niedrig oder zu hoch -- ein Schönheitsfehler in einer erfundenen
 * Ansicht, und damit der billigere der beiden Preise.
 */
export const DEMO_RECIPE_BUDGET: RecipeBudget = {
  hourLeft: 5,
  dayLeft: 20,
  hardLeft: 50,
  freeAt: null,
  hardFreeAt: null,
};

/**
 * Der Vorschlags-Stapel relativ zum Stichtag.
 *
 * `basedOn` entsteht aus denselben Artikel-Vorlagen wie der Demo-Vorrat und
 * teilt sie nach derselben Grenze auf wie die echte Auswahl: bis sieben Tage
 * dringend, alles Spätere Vorrat, Abgelaufenes gar nicht (siehe
 * selectRecipeBasis). Damit stimmen Namen und Restlaufzeiten zusammen, egal
 * an welchem Tag jemand die Demo öffnet.
 */
export function buildDemoRecipeSuggestions(now: Date): SuggestionView[] {
  const labelOf = new Map(DEMO_CATEGORIES.map((category) => [category.key, category.label]));

  return [
    {
      id: 1,
      // Nicht "gerade eben": ein Stapel, der in derselben Sekunde entstanden
      // ist, in der die Seite geladen wurde, sieht aus wie ein Fehler.
      createdAt: addMinutes(-25, now).toISOString(),
      recipes: DEMO_RECIPE_SEEDS,
      basedOn: DEMO_ITEM_SEEDS.filter((seed) => seed.expiryInDays >= 0).map((seed) => ({
        name: seed.name,
        category: labelOf.get(seed.category) ?? seed.category,
        quantity: seed.quantity,
        expiryDate: addDays(seed.expiryInDays, now).toISOString(),
        urgent: seed.expiryInDays <= 7,
      })),
    },
  ];
}

function addMinutes(minutes: number, from: Date): Date {
  return new Date(from.getTime() + minutes * 60_000);
}

/**
 * Der Satz, der die Demo einordnet -- auf dem letzten Onboarding-Schritt
 * unter dem Knopf und im Hinweis, den jede schreibende Geste in der Demo
 * öffnet.
 *
 * Der Entwurf schreibt an dieser Stelle "Der Demo-Vorrat läuft ohne Konto
 * direkt auf deinem Gerät. Beim Registrieren nimmst du ihn einfach mit." Das
 * beschreibt den vollen Demo-Modus mit lokalem Schreibzugriff, den es hier
 * ausdrücklich noch nicht gibt -- der Satz wäre also nicht bloß ungenau,
 * sondern ein Versprechen, das die Seite nicht hält. An einer Stelle
 * definiert, damit beide Verwendungen nicht auseinanderlaufen.
 */
export const DEMO_FOOTNOTE =
  "Zum Anschauen, ohne Konto. Für den eigenen Vorrat brauchst du eins.";
