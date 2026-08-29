import type { Category } from "@/db/schema";

/**
 * Reihenfolge und Inhalt der Standardkategorien, mit denen eine neue
 * Datenbank befuellt wird (siehe drizzle/-Migration). Nur hier fuer die
 * Seed-Migration und den OFF-Tag-Abgleich als Referenz gepflegt -- Nutzer
 * koennen Kategorien danach frei umbenennen, hinzufuegen oder loeschen.
 */
export const DEFAULT_CATEGORIES = [
  { key: "milchprodukte", label: "Milchprodukte", shelfLifeDays: 7 },
  { key: "fleisch_fisch", label: "Fleisch & Fisch", shelfLifeDays: 3 },
  { key: "obst_gemuese", label: "Obst & Gemüse", shelfLifeDays: 5 },
  { key: "brot_backwaren", label: "Brot & Backwaren", shelfLifeDays: 4 },
  { key: "kuehlware_sonstig", label: "Kühlware (sonstig)", shelfLifeDays: 7 },
  { key: "tiefkuehl", label: "Tiefkühl", shelfLifeDays: 180 },
  { key: "konserven", label: "Konserven", shelfLifeDays: 365 },
  { key: "trockenwaren", label: "Trockenwaren", shelfLifeDays: 270 },
  { key: "getraenke", label: "Getränke", shelfLifeDays: 180 },
  { key: "sonstiges", label: "Sonstiges", shelfLifeDays: 14 },
] as const;

export function estimateExpiryDate(shelfLifeDays: number, from: Date = new Date()): Date {
  const result = new Date(from);
  result.setDate(result.getDate() + shelfLifeDays);
  return result;
}

export function slugifyCategoryKey(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || "kategorie";
}

/**
 * Zuordnung von Open Food Facts "categories_tags" zu einer Kategorie der
 * Liste.
 *
 * OFF liefert die Tags slugifiziert und von allgemein nach speziell, z.B.
 * ["en:beverages", "en:sodas", "en:fruit-sodas"]. Die frühere Fassung hat alle
 * Tags zu einer Zeichenkette verklebt und die erste passende Regex gewinnen
 * lassen -- damit entschied die Reihenfolge der REGELN statt der Aussage des
 * Produkts: "fruit-sodas" traf auf /fruit/, und eine Spezi landete unter
 * Obst & Gemüse. Ein Hähnchenschnitzel traf auf nichts und fiel durch.
 *
 * Stattdessen wird jetzt jedes Tag einzeln ausgewertet und stimmt für genau
 * eine Kategorie ab; die Kategorie mit den meisten Stimmen gewinnt. Ein
 * einzelnes irreführendes Tag kann das Ergebnis damit nicht mehr kippen.
 */

// Tags, die jedes zweite Produkt trägt und deshalb nichts aussagen.
const GENERIC_TAGS = new Set([
  "plant-based-foods-and-beverages",
  "plant-based-foods",
  "foods",
  "food",
  "fresh-foods",
  "groceries",
  "products",
  "lebensmittel",
  // Traegt bei OFF auch, was mit Obst und Gemuese wenig zu tun hat -- ein
  // paniertes Schnitzel etwa. Genau daran ist die alte Zuordnung gescheitert.
  "fruits-and-vegetables-based-foods",
  "fruits-and-vegetables-based-foods-and-beverages",
]);

type Matcher = {
  key: string;
  /** Einzelne Tag-Bestandteile (OFF-Slugs sind mit "-" getrennt). */
  tokens: string[];
  /** Teilzeichenketten -- vor allem für deutsche Komposita wie "haehnchenschnitzel". */
  stems: string[];
  /** Trifft das auf das ganze Tag zu, ist diese Kategorie ausgeschlossen. */
  except?: RegExp;
};

// Die Reihenfolge entscheidet, wenn INNERHALB eines Tags mehrere Kategorien
// passen. Verpackung schlägt Inhalt: "canned-tomatoes" ist eine Konserve und
// "frozen-vegetables" Tiefkühlware -- danach richtet sich die Haltbarkeit.
const MATCHERS: Matcher[] = [
  {
    key: "tiefkuehl",
    tokens: ["frozen", "ice", "ices", "sorbets", "popsicles"],
    stems: ["tiefkuhl", "tiefgekuhl", "gefroren"],
  },
  {
    key: "konserven",
    tokens: ["canned", "cans", "tinned", "preserves", "preserved", "pickled"],
    stems: ["konserve", "dosen"],
  },
  {
    key: "getraenke",
    tokens: [
      "beverage", "beverages", "drink", "drinks", "soda", "sodas", "cola", "colas",
      "water", "waters", "juice", "juices", "lemonade", "lemonades", "beer", "beers",
      "wine", "wines", "spirits", "tea", "teas", "coffee", "coffees", "smoothies",
      "nectars", "syrups", "sirups",
    ],
    stems: ["getrank", "saft", "safte", "limonade", "spezi", "schorle", "bier", "wein", "wasser"],
    // Milchmischgetränke halten sich wie Milch, nicht wie Limonade.
    except: /milk|dairy|milch/,
  },
  {
    key: "milchprodukte",
    tokens: [
      "dairy", "dairies", "milk", "milks", "yogurt", "yogurts", "yoghurt", "yoghurts",
      "cheese", "cheeses", "cream", "creams", "butter", "quark", "kefir", "buttermilk",
      "curd", "curds", "mozzarella", "mascarpone", "feta",
    ],
    stems: ["milch", "joghurt", "jogurt", "kase", "sahne", "schmand"],
    // "peanut-butters" und "nut-butters" sind Brotaufstriche, keine Molkerei.
    except: /peanut|nut-butter|erdnuss/,
  },
  {
    key: "fleisch_fisch",
    tokens: [
      "meat", "meats", "poultry", "poultries", "chicken", "chickens", "beef", "pork", "veal",
      "turkey", "lamb", "sausage", "sausages", "ham", "hams", "bacon", "salami",
      "fish", "fishes", "seafood", "seafoods", "salmon", "tuna", "shrimps",
      "schnitzel", "schnitzels", "charcuterie",
    ],
    stems: [
      "fleisch", "wurst", "hahnchen", "gefluegel", "geflugel", "fisch", "schinken",
      "schnitzel", "hackfleisch", "steak", "rind", "schwein", "pute", "lachs",
    ],
  },
  {
    key: "brot_backwaren",
    tokens: [
      "bread", "breads", "bakery", "pastries", "pastry", "biscuits", "cakes", "cake",
      "croissants", "baguettes", "toast", "toasts", "buns",
    ],
    stems: ["brot", "backwaren", "kuchen", "geback", "semmel", "brezel"],
  },
  {
    key: "trockenwaren",
    tokens: [
      "pasta", "pastas", "rice", "rices", "cereal", "cereals", "flour", "flours",
      "noodles", "muesli", "mueslis", "lentils", "couscous", "sugar", "salt",
      "nut", "nuts", "peanut", "peanuts", "legumes",
    ],
    stems: ["nudel", "teigwaren", "mehl", "hulsenfr", "haferflocken"],
  },
  {
    key: "obst_gemuese",
    tokens: [
      "fruit", "fruits", "vegetable", "vegetables", "salad", "salads", "potatoes",
      "tomatoes", "apples", "bananas", "berries", "mushrooms", "herbs",
    ],
    stems: ["obst", "gemuse", "salat", "kartoffel", "tomate", "apfel", "banane"],
  },
];

function normalizeTag(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/^[a-z]{2}:/, "")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function matchTag(tag: string): string | undefined {
  const tokens = tag.split("-");
  for (const matcher of MATCHERS) {
    if (matcher.except?.test(tag)) continue;
    if (tokens.some((token) => matcher.tokens.includes(token))) return matcher.key;
    if (matcher.stems.some((stem) => tag.includes(stem))) return matcher.key;
  }
  return undefined;
}

export function guessCategoryFromOffTags(
  tags: string[],
  availableCategories: Pick<Category, "key">[],
  productName?: string,
): string | undefined {
  const available = new Set(availableCategories.map((c) => c.key));
  const relevant = tags
    .map(normalizeTag)
    .filter((tag) => tag.length > 0 && !GENERIC_TAGS.has(tag));

  const scores = new Map<string, number>();
  relevant.forEach((tag, index) => {
    const key = matchTag(tag);
    if (!key) return;
    // Spätere Tags sind bei OFF die spezifischeren ("en:beverages" ->
    // "en:colas"), deshalb wiegen sie etwas schwerer.
    const weight = 1 + (index + 1) / (relevant.length + 1);
    scores.set(key, (scores.get(key) ?? 0) + weight);
  });

  // Viele Produkte haben bei OFF ueberhaupt keine Kategorien -- ein
  // "Haehnchenschnitzel" traegt die Antwort dann nur noch im Namen. Das Gewicht
  // liegt bewusst unter dem mehrerer uebereinstimmender Tags: der Name
  // entscheidet, wenn sonst nichts da ist, und ueberstimmt keine echten Daten.
  if (productName) {
    for (const word of normalizeTag(productName).split("-")) {
      const key = matchTag(word);
      if (key) {
        scores.set(key, (scores.get(key) ?? 0) + 1.5);
        break;
      }
    }
  }

  // Kategorien lassen sich umbenennen und löschen: gibt es die beste Wahl in
  // dieser Liste nicht, greift die nächstbeste statt gar keiner.
  const ranked = Array.from(scores.entries()).sort(([, a], [, b]) => b - a);
  return ranked.find(([key]) => available.has(key))?.[0];
}
