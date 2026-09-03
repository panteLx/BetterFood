"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  Minus,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/ui/chip";
import { DateSheet } from "@/components/date-sheet";
import { ExpiryPicker } from "@/components/expiry-picker";
import {
  Dialog,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { estimateExpiryDate } from "@/lib/categories";
import {
  DEFAULT_SHELF_LIFE_DAYS,
  expiryLabel,
  formatLong,
  fromDateInputValue,
  startOfDay,
  toDateInputValue,
} from "@/lib/expiry";
import { useIsClient } from "@/lib/use-is-client";
import { cn, normalizeProductName } from "@/lib/utils";
import type { EntryMethod } from "@/lib/entry-method";
import type { Category, Place, ProductKnowledge } from "@/db/schema";

// Wie viele bereits gelernte Produkte als Vorschlag unter dem Namensfeld
// stehen. Mehr als drei fuellen auf dem Telefon eine ganze Zeile und
// verdraengen die Frage, die darunter kommt.
const SUGGESTION_COUNT = 3;

// Ab wann getippter Text als Suche gilt. Ein einzelner Buchstabe passt auf
// zu vieles, um die drei Plaetze sinnvoll zu belegen.
const SEARCH_FROM_CHARS = 2;

type CategoryOption = Pick<Category, "key" | "label" | "shelfLifeDays" | "defaultPlaceId">;
type PlaceOption = Pick<Place, "id" | "name">;

export function ItemForm({
  categories,
  places,
  itemId,
  initialName = "",
  initialCategory,
  initialExpiryDate,
  initialQuantity = 1,
  initialPlaceId = null,
  initialNote = "",
  barcode,
  title,
  redirectTo,
  method = "manual",
  inlineExpiry = false,
}: {
  categories: CategoryOption[];
  places: PlaceOption[];
  itemId?: number;
  initialName?: string;
  initialCategory?: string;
  initialExpiryDate?: Date;
  initialQuantity?: number;
  initialPlaceId?: number | null;
  initialNote?: string;
  barcode?: string;
  title: string;
  // Nur fuer Formulare ausserhalb der Modal-Routen (z.B. /confirm nach dem
  // Scannen, erreicht per echter Navigation von /scan aus, oder /add als
  // Vollseite ueber einen Deep-Link): dort landet router.back() auf der
  // Kamera-Seite oder sogar ausserhalb der App. Wenn gesetzt, wird
  // stattdessen dorthin navigiert.
  redirectTo?: string;
  /**
   * Auf welchem Weg dieser Artikel erfasst wurde. Der Abschluss-Screen bietet
   * danach genau diesen Weg wieder an -- wer von Hand eintraegt, will als
   * naechstes von Hand eintragen und nicht in die Kamera geschickt werden.
   */
  method?: EntryMethod;
  /**
   * Ob der Kalender offen im Feld "Haltbar bis" steht statt hinter einem
   * Knopf, der erst ein Blatt öffnet.
   *
   * Gesetzt beim Erfassen (/add, /confirm), nicht beim Korrigieren (/edit).
   * Der Unterschied ist keine Geschmacksfrage: beim Erfassen hat
   * initialExpiryValue() den Richtwert der Kategorie längst berechnet, er
   * war nur unsichtbar -- wer nichts antippte, speicherte eine Schätzung,
   * die er nie gesehen hat. Beim Korrigieren steht dagegen ein echtes,
   * früher gewähltes Datum da; ein aufgeklappter Kalender wäre dort ein
   * Vorschlag zum Ändern, wo keiner nötig ist, und schöbe die übrigen
   * Felder um eine halbe Bildschirmhöhe nach unten.
   */
  inlineExpiry?: boolean;
}) {
  const router = useRouter();
  const [categoryList, setCategoryList] =
    useState<CategoryOption[]>(categories);
  // Kein Raten mehr: kennt die Liste dieses Produkt noch nicht, bleibt die
  // Kategorie leer und der Nutzer entscheidet einmal selbst. Ab dem zweiten
  // Mal kommt die Vorauswahl aus genau dieser Entscheidung (siehe
  // applyKnownProduct). Eine geratene Kategorie war teurer als gar keine:
  // sie sah richtig aus und brachte eine falsche Haltbarkeit gleich mit.
  const fallbackCategory = initialCategory ?? "";

  // Lazy, nicht als Render-Ausdruck: estimateExpiryDate ruft new Date() auf,
  // und ein "unstable value" waehrend des Prerenders laesst Next die Route
  // abbrechen (siehe nextjs.org/docs/messages/blocking-prerender-current-time).
  function initialExpiryValue() {
    if (initialExpiryDate) return toDateInputValue(initialExpiryDate);
    const shelfLife = categoryList.find(
      (c) => c.key === fallbackCategory,
    )?.shelfLifeDays;
    if (shelfLife !== undefined)
      return toDateInputValue(estimateExpiryDate(shelfLife));
    // Ohne Kategorie gibt es nichts zu schätzen -- hinter dem Blatt füllt
    // sich das Feld erst, sobald eine gewählt ist. Steht der Kalender aber
    // offen im Formular, braucht er von Anfang an einen Monat, den er zeigen
    // kann: dann greift derselbe Rückfall wie im Prüf-Flow. Nebenwirkung mit
    // Absicht -- auf diesem Weg ist expiryDate nie leer, "Bitte ein
    // Haltbarkeitsdatum wählen." kann hier also gar nicht mehr auslösen.
    return inlineExpiry
      ? toDateInputValue(estimateExpiryDate(DEFAULT_SHELF_LIFE_DAYS))
      : "";
  }

  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(fallbackCategory);
  const [placeId, setPlaceId] = useState<number | null>(initialPlaceId);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [note, setNote] = useState(initialNote);
  const [dateTouched, setDateTouched] = useState(Boolean(initialExpiryDate));
  // Derselbe Wert noch einmal als Ref, aus demselben Grund wie
  // categoryTouchedRef und placeTouchedRef darunter: applyCategory läuft auch
  // aus applyKnownProduct heraus, also NACH einem await, und sähe im State nur
  // den Stand des Renders, der die Abfrage angestoßen hat. Mit dem offen
  // stehenden Kalender ist das erreichbar geworden -- wer "Milch" tippt und
  // sofort einen Tag antippt, hatte nach 500 ms Debounce plus Antwort seinen
  // gewählten Tag wieder durch den Richtwert der gelernten Kategorie ersetzt.
  // Hinter dem Blatt kostete derselbe Weg mehrere Griffe und war praktisch
  // nicht zu treffen.
  const dateTouchedRef = useRef(dateTouched);
  const [expiryDate, setExpiryDate] = useState(initialExpiryValue);
  const [dateSheetOpen, setDateSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // Sobald der Nutzer selbst gewaehlt hat, wird nichts mehr ueberschrieben.
  const categoryTouchedRef = useRef(false);
  const placeTouchedRef = useRef(false);
  const nameTouchedRef = useRef(false);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [learnedCategory, setLearnedCategory] = useState<string | null>(null);
  const [learnedPlace, setLearnedPlace] = useState<number | null>(null);
  // Alles, was die Liste kennt -- nicht nur die drei, die gerade darunter
  // stehen: der Vorschlag soll mit der Eingabe mitsuchen koennen.
  const [knownProducts, setKnownProducts] = useState<
    { key: string; name: string }[]
  >([]);
  const [deleting, setDeleting] = useState(false);

  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryShelfLife, setNewCategoryShelfLife] = useState("14");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const isClient = useIsClient();
  // Der Stichtag für Kalender, Blatt und die Restlaufzeit unter dem Datum --
  // null, solange der Server (und der erste Client-Render) läuft: new Date()
  // ist dort ein "unstable value" und bricht den Prerender der Route ab.
  //
  // Bei jedem Render neu gelesen und nur über die Tageszahl gemerkt. Beides
  // hat einen Grund. Ein useMemo(..., [isClient]) rechnete genau einmal, bei
  // der Hydration -- und unter Cache Components bleibt diese Seite per
  // <Activity> am Leben statt abgebaut zu werden (siehe shouldResetRef weiter
  // unten). Ein über Nacht offener PWA-Tab trüge dann am nächsten Morgen noch
  // den gestrigen Stichtag: DateCalendar sperrt daraus die Vergangenheit,
  // gestern wäre also weiter anwählbar. Umgekehrt reichte auch nicht, den Wert
  // roh durchzureichen -- ein neues Date-Objekt je Render hängt sich in die
  // useMemo-Kette von DateCalendar und baut bei jedem Tastendruck im
  // Namensfeld dessen 42 Zellen neu auf.
  const todayTime = isClient ? startOfDay(new Date()).getTime() : null;
  const today = useMemo(
    () => (todayTime === null ? null : new Date(todayTime)),
    [todayTime],
  );

  // Nach einem erfolgreichen Speichern muss das Formular zurueckgesetzt
  // werden: Cache Components unmountet die verlassene Route nicht, sondern
  // versteckt sie via <Activity>, der State ueberlebt also (siehe
  // node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md).
  //
  // Zurueckgesetzt wird auf die initial*-Props, NICHT auf leere Werte: auf
  // /confirm kommt der Produktname vom Server, und wer nach dem Speichern
  // per Browser-Zurueck auf dieselbe URL zurueckkehrt, bekommt genau diese
  // Instanz wieder zu sehen - mit einem harten "" stand das Namensfeld dann
  // leer da, bis man die Seite neu lud.
  //
  // Der Reset laeuft im useLayoutEffect-Cleanup, also erst beim Verstecken,
  // damit die noch sichtbare Seite waehrend der Wegnavigation nicht kurz
  // leer aufblitzt.
  const shouldResetRef = useRef(false);
  const resetToInitialRef = useRef<() => void>(undefined);

  // Nach jedem Render aktualisiert, damit der Cleanup unten die aktuellen
  // Props/Kategorien sieht, ohne selbst von ihnen abzuhaengen (eine
  // Dependency wuerde den Cleanup schon bei einer neu angelegten Kategorie
  // ausloesen und das Formular mitten in der Eingabe zuruecksetzen).
  useEffect(() => {
    resetToInitialRef.current = () => {
      setName(initialName);
      setCategory(fallbackCategory);
      setPlaceId(initialPlaceId);
      setQuantity(initialQuantity);
      setNote(initialNote);
      dateTouchedRef.current = Boolean(initialExpiryDate);
      setDateTouched(dateTouchedRef.current);
      setExpiryDate(initialExpiryValue());
      categoryTouchedRef.current = false;
      placeTouchedRef.current = false;
      nameTouchedRef.current = false;
      setLearnedCategory(null);
      setLearnedPlace(null);
    };
  });

  useLayoutEffect(() => {
    return () => {
      if (!shouldResetRef.current) return;
      shouldResetRef.current = false;
      resetToInitialRef.current?.();
    };
  }, []);

  /**
   * Fragt nach, ob diese Liste das Produkt schon kennt, und uebernimmt die
   * damalige Entscheidung -- Kategorie und Ort. Das ersetzt das frühere Raten
   * aus den Open-Food-Facts-Kategorien vollstaendig.
   *
   * Beide Felder werden einzeln betrachtet: wer die Kategorie schon selbst
   * gewaehlt hat, soll trotzdem den gelernten Ort bekommen, und umgekehrt.
   */
  async function applyKnownProduct(
    lookup: { barcode?: string; name?: string },
    options: { withName: boolean },
  ) {
    if (itemId) return;
    if (categoryTouchedRef.current && placeTouchedRef.current) return;

    const params = new URLSearchParams();
    if (lookup.barcode) params.set("barcode", lookup.barcode);
    if (lookup.name?.trim()) params.set("name", lookup.name.trim());
    if (params.size === 0) return;

    try {
      const res = await fetch(`/api/items/known?${params}`);
      if (!res.ok) return;
      const known = (await res.json()) as {
        found: boolean;
        category?: string;
        name?: string;
        placeId?: number | null;
      };
      if (!known.found || !known.category) return;

      // In der Zwischenzeit koennte der Nutzer selbst gewaehlt haben.
      if (!categoryTouchedRef.current) {
        setLearnedCategory(known.category);
        applyCategory(known.category);
      }
      if (!placeTouchedRef.current && known.placeId != null) {
        setLearnedPlace(known.placeId);
        setPlaceId(known.placeId);
      }
      if (options.withName && known.name && !nameTouchedRef.current)
        setName(known.name);
    } catch {
      // Ohne Antwort bleibt es bei der leeren Vorauswahl -- kein Grund, dem
      // Nutzer etwas anzuzeigen.
    }
  }

  // Laeuft nicht nur beim ersten Rendern, sondern bei jedem erneuten Anzeigen:
  // <Activity> baut die Effekte einer versteckten Seite ab und beim
  // Wiederanzeigen neu auf, waehrend der State erhalten bleibt. Genau das
  // fehlte vorher -- nach dem Speichern eines Artikels zeigte derselbe
  // Barcode beim naechsten Scan noch den Stand von davor.
  const showLookupRef = useRef<() => void>(undefined);
  useEffect(() => {
    showLookupRef.current = () => {
      void applyKnownProduct({ barcode, name }, { withName: true });
    };
  });
  useEffect(() => {
    showLookupRef.current?.();
    return () => {
      if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    };
  }, []);

  // Was die Liste schon kennt, als Vorschlag unter dem Namensfeld:
  // "Reste vom Abendessen" tippt niemand gern zweimal. Auch mit Barcode
  // geholt -- ein Scan ohne Treffer endet ebenfalls beim Tippen.
  useEffect(() => {
    if (itemId) return;
    let active = true;
    fetch("/api/knowledge")
      .then((res) => (res.ok ? res.json() : []))
      .then((entries: ProductKnowledge[]) => {
        if (!active) return;
        // Nach Vergleichsnamen entdoppelt: dasselbe Produkt kann mehrere
        // Zeilen in der Wissensdatenbank haben -- einmal gescannt (mit
        // Barcode), einmal von Hand eingetippt (ohne). Als Vorschlag ist das
        // trotzdem ein Artikel, und "Margarine" zweimal untereinander sieht
        // aus wie ein Fehler. Der juengste Eintrag gewinnt, also der mit
        // der Schreibweise, die zuletzt gespeichert wurde -- und die
        // Reihenfolge ist zugleich die der zuletzt benutzten Produkte.
        const byName = new Map<string, string>();
        for (const entry of [...entries].sort(
          (a, b) =>
            Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt)),
        )) {
          const key = normalizeProductName(entry.name);
          if (!key || byName.has(key)) continue;
          byName.set(key, entry.name);
        }
        setKnownProducts(
          [...byName].map(([key, label]) => ({ key, name: label })),
        );
      })
      .catch(() => {
        // Ohne Vorschlaege tippt man eben -- kein Fehler, der jemanden interessiert.
      });
    return () => {
      active = false;
    };
  }, [itemId]);

  /**
   * Die drei Chips unter dem Namensfeld: bei leerem Feld die zuletzt
   * benutzten Produkte, sobald getippt wird die passenden.
   *
   * Der Vorschlag ist mehr als Tipparbeit -- er trifft genau den Eintrag,
   * unter dem die Liste Kategorie, Fach und Haltbarkeit gelernt hat. Wer
   * "Mozza" tippt und den Rest selbst zu Ende schreibt, bekommt zwar
   * denselben Namen, aber nur mit etwas Glueck dieselbe Schreibweise.
   */
  const suggestions = useMemo(() => {
    const typed = normalizeProductName(name);
    if (typed.length === 0)
      return knownProducts.slice(0, SUGGESTION_COUNT).map((e) => e.name);
    if (typed.length < SEARCH_FROM_CHARS) return [];
    const hits = knownProducts.filter(
      (entry) => entry.key !== typed && entry.key.includes(typed),
    );
    // Was vorn passt, passt besser: "Mozza" meint eher "Mozzarella 125g" als
    // "Buffet-Platte mit Mozzarella". Innerhalb beider Gruppen bleibt die
    // Reihenfolge nach zuletzt benutzt.
    return hits
      .filter((entry) => entry.key.startsWith(typed))
      .concat(hits.filter((entry) => !entry.key.startsWith(typed)))
      .slice(0, SUGGESTION_COUNT)
      .map((entry) => entry.name);
  }, [knownProducts, name]);

  function leave(target?: string) {
    const destination = target ?? redirectTo;
    if (destination) router.push(destination);
    else router.back();
  }

  /**
   * Uebernimmt eine Kategorie -- und mit ihr das, was aus ihr folgt: das
   * geschaetzte MHD und das Fach, in dem diese Kategorie ueblicherweise
   * liegt.
   *
   * Nur eine eigene Auswahl des Nutzers (placeTouchedRef) haelt das Fach
   * fest. Was die Liste ueber das Produkt gelernt hat, fuellt die
   * Erstbelegung (applyKnownProduct traegt es nach dieser Funktion ein),
   * ueberlebt aber keinen aktiven Kategoriewechsel: wer selbst umsortiert,
   * erwartet, dass das Fach mitgeht, statt sichtbar falsch stehen zu
   * bleiben.
   */
  function applyCategory(value: string, list: CategoryOption[] = categoryList) {
    setCategory(value);
    const option = list.find((c) => c.key === value);

    if (!dateTouchedRef.current) {
      setExpiryDate(
        toDateInputValue(
          estimateExpiryDate(option?.shelfLifeDays ?? DEFAULT_SHELF_LIFE_DAYS),
        ),
      );
    }

    if (!placeTouchedRef.current && option?.defaultPlaceId != null) {
      setPlaceId(option.defaultPlaceId);
    }
  }

  /**
   * Der Nutzer hat das MHD selbst benannt -- im Raster, über einen Sprung oder
   * im Blatt. Ab hier schreibt kein Kategoriewechsel den Wert mehr um, und im
   * Kalender wird aus dem Ring eine gefüllte Fläche.
   */
  function chooseDate(value: string) {
    dateTouchedRef.current = true;
    setDateTouched(true);
    setExpiryDate(value);
  }

  function handleNameChange(value: string) {
    nameTouchedRef.current = true;
    setName(value);
    if (itemId) return;
    // Auch von Hand eingetragene Artikel sollen wiedererkannt werden -- dort
    // gibt es keinen Barcode, nur den Namen.
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(() => {
      void applyKnownProduct({ barcode, name: value }, { withName: false });
    }, 500);
  }

  function handleCategoryChange(value: string) {
    categoryTouchedRef.current = true;
    setLearnedCategory(null);
    // Zieht das Standardfach der neuen Kategorie nach, siehe applyCategory.
    // learnedPlace bleibt stehen und korrigiert sich selbst: der Hinweis
    // haengt daran, dass der gelernte Ort auch der gewaehlte ist.
    applyCategory(value, categoryList);
  }

  function handlePlaceChange(value: number) {
    placeTouchedRef.current = true;
    setLearnedPlace(null);
    setPlaceId(value);
  }

  async function handleCreateCategory() {
    if (!newCategoryLabel.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    const days = Number(newCategoryShelfLife);
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Bitte eine gültige Haltbarkeit eingeben.");
      return;
    }
    setCreatingCategory(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: newCategoryLabel.trim(),
          shelfLifeDays: Math.round(days),
        }),
      });
      if (!res.ok) throw new Error();
      const created = (await res.json()) as Category;
      const nextList = [...categoryList, created].sort((a, b) =>
        a.label.localeCompare(b.label),
      );
      setCategoryList(nextList);
      categoryTouchedRef.current = true;
      applyCategory(created.key, nextList);
      setNewCategoryOpen(false);
      toast.success("Kategorie erstellt");
    } catch {
      toast.error("Konnte Kategorie nicht anlegen.");
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleDelete() {
    if (!itemId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`${name} gelöscht`);
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Konnte Artikel nicht löschen.");
      setDeleting(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    // Der Ort ist Pflicht, sobald es ueberhaupt welche gibt: ein Vorrat, von
    // dem man nicht weiss, in welchem Fach er liegt, beantwortet die Frage
    // nicht, wegen der man nachschaut. Hat die Liste kein einziges Fach, gibt
    // es nichts zu waehlen -- dann darf die Pflicht auch nicht blockieren.
    if (places.length > 0 && placeId === null) {
      toast.error("Bitte einen Ort wählen.");
      return;
    }
    if (!category) {
      toast.error("Bitte eine Kategorie wählen.");
      return;
    }
    // Rückversicherung, kein erreichbarer Zweig mehr. Mit inlineExpiry steht
    // ab dem ersten Render ein Datum in expiryDate (siehe initialExpiryValue),
    // und der Blatt-Weg läuft nur noch auf /edit, wo items.expiryDate NOT NULL
    // ist -- initialExpiryDate ist dort also immer gesetzt. Die Prüfung bleibt
    // trotzdem stehen: sie ist die letzte Schranke vor einem Artikel ohne MHD,
    // den die Ablaufwarnung danach nie melden könnte, und sie kostet nichts.
    if (!expiryDate) {
      toast.error("Bitte ein Haltbarkeitsdatum wählen.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(itemId ? `/api/items/${itemId}` : "/api/items", {
        method: itemId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          barcode,
          placeId,
          note: note.trim() || null,
          quantity,
          expiryDate: fromDateInputValue(expiryDate).toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Speichern fehlgeschlagen");

      if (itemId) {
        toast.success(`${name} aktualisiert`);
        leave();
        router.refresh();
        return;
      }

      const saved = (await res.json()) as {
        merged?: boolean;
        quantity?: number;
      };
      // Reset erst beim Verstecken durch Activity, siehe shouldResetRef.
      shouldResetRef.current = true;

      // Statt einer Meldung, die nach vier Sekunden verschwindet: ein Screen,
      // der die naechste Entscheidung anbietet. Nach dem Einkauf ist der
      // naechste Artikel der Normalfall, nicht die Ausnahme.
      const params = new URLSearchParams({
        name: name.trim(),
        date: expiryDate,
        method,
      });
      if (saved.merged && saved.quantity)
        params.set("merged", String(saved.quantity));
      router.push(`/saved?${params}`);
      router.refresh();
    } catch {
      toast.error("Konnte Artikel nicht speichern.");
    } finally {
      setSaving(false);
    }
  }

  const placeLearned = learnedPlace !== null && learnedPlace === placeId;
  const categoryLearned =
    learnedCategory !== null && learnedCategory === category && category !== "";
  const shelfLifeDays = categoryList.find(
    (c) => c.key === category,
  )?.shelfLifeDays;
  const categoryLabel = categoryList.find((c) => c.key === category)?.label;
  const selectedDate = expiryDate ? fromDateInputValue(expiryDate) : null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5 px-5 pt-2 pb-5">
        <div className="flex items-center gap-3">
          {/* Weisser Rundknopf statt des bisherigen Ghost-Buttons -- der
              Entwurf traegt Tiefe ueber getoente Schatten statt ueber Raender,
              und ein 44px-Kreis auf --card mit --shadow-row ist genau dieses
              Material auch fuer Kopfzeilen-Knoepfe. */}
          <Button
            variant="ghost"
            size="icon-touch"
            aria-label="Zurück"
            onClick={() => leave()}
            className="-ml-1 rounded-full bg-card shadow-row"
          >
            <ArrowLeft className="size-5" strokeWidth={2.4} />
          </Button>
          <h1 className="text-[22px] leading-tight">{title}</h1>
        </div>

        <Field label="Was ist es?" htmlFor="name">
          <Input
            id="name"
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="z. B. Feldsalat"
            autoFocus={!itemId && !initialName}
            className="h-14 rounded-[22px] px-[18px] font-heading text-base font-bold"
          />
          {!itemId && suggestions.length > 0 && (
            <div className="flex flex-wrap gap-[7px] pt-0.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleNameChange(suggestion)}
                  // Die gestrichelte Umrandung faellt weg -- der Entwurf
                  // traegt Vorschlaege als ruhige Flaeche (surface-2), nicht
                  // als Platzhalter-Andeutung.
                  className="h-8 rounded-full bg-surface-2 px-[13px] text-[12.5px] font-bold text-muted-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </Field>

        {/* Die Kategorie steht ueber dem Ort, weil sie ihn beantwortet: jede
            Kategorie kennt ihr Standardfach, und wer von oben nach unten
            arbeitet, soll die Frage nicht zweimal gestellt bekommen. */}
        <Field label="Kategorie">
          <div className="flex flex-wrap gap-2">
            {categoryList.map((option) => (
              <Chip
                key={option.key}
                active={category === option.key}
                onClick={() => handleCategoryChange(option.key)}
                className="text-[12.5px]"
              >
                {option.label}
              </Chip>
            ))}
            <button
              type="button"
              onClick={() => {
                setNewCategoryLabel("");
                setNewCategoryShelfLife("14");
                setNewCategoryOpen(true);
              }}
              // Wie die uebrigen, nicht ausgewaehlten Kategorie-Chips: weisse
              // Pille mit shadow-row statt der bisherigen gestrichelten
              // Umrandung. Nur die Textfarbe (primary-deep) und das
              // Plus-Icon zeigen, dass dieser Chip eine Handlung ist statt
              // einer Auswahl.
              className="inline-flex h-[34px] items-center gap-1 rounded-full bg-card px-3.5 font-heading text-[12.5px] font-bold text-primary-deep shadow-row"
            >
              <Plus className="size-3.5" strokeWidth={2.4} />
              Neue Kategorie
            </button>
          </div>
          {/* Sind beide Felder uebernommen, sagt es der Hinweis unter dem Ort
              in einem Satz -- er steht unter dem unteren der beiden Felder,
              damit er nichts ankuendigt, was noch gar nicht zu sehen war.
              Hat die Liste kein einziges Fach, gibt es kein Ortsfeld und der
              Satz steht hier. */}
          {categoryLearned && (!placeLearned || places.length === 0) && (
            <LearnedHint>
              Die Kategorie stammt aus deinem letzten Eintrag zu diesem
              Artikel.
            </LearnedHint>
          )}
        </Field>

        {places.length > 0 && (
          <Field label="Wo liegt es?">
            <div className="flex flex-wrap gap-2">
              {places.map((place) => (
                <Chip
                  key={place.id}
                  active={placeId === place.id}
                  // Kein Abwaehlen mehr: der Ort ist Pflicht, und ein zweites
                  // Antippen fuehrte sonst in einen Zustand zurueck, den das
                  // Speichern gleich wieder anmahnt.
                  onClick={() => handlePlaceChange(place.id)}
                  // Drei gleich breite 44px-Felder mit 16px statt vollem
                  // Radius -- der Ort ist die einzige Chip-Reihe, die als
                  // Feld statt als Pille auftritt, deshalb die Radius- und
                  // Hoehen-Ueberschreibung hier statt in ui/chip.tsx.
                  className="h-11 flex-1 rounded-[16px] px-2.5"
                >
                  {place.name}
                </Chip>
              ))}
            </div>
            {placeLearned && (
              <LearnedHint>
                {categoryLearned
                  ? "Ort und Kategorie stammen"
                  : "Der Ort stammt"}{" "}
                aus deinem letzten Eintrag zu diesem Artikel.
              </LearnedHint>
            )}
          </Field>
        )}

        <Field label="Menge">
          {/* Die 44px-Trefferflaeche der beiden Rundknoepfe bleibt Pflicht --
              icon-touch liefert genau das, nur Radius und Flaeche wechseln
              auf die Pillenleiste des Entwurfs. */}
          <div className="flex h-14 w-fit items-center gap-1 rounded-full bg-card px-1.5 shadow-row">
            <Button
              variant="ghost"
              size="icon-touch"
              aria-label="Menge verringern"
              disabled={quantity <= 1}
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              className="rounded-full bg-surface-2 text-faint hover:bg-surface-2"
            >
              <Minus className="size-[18px]" strokeWidth={2.8} />
            </Button>
            <span className="w-11 text-center font-heading text-xl font-bold tabular-nums">
              {quantity}
            </span>
            <Button
              variant="ghost"
              size="icon-touch"
              aria-label="Menge erhöhen"
              onClick={() => setQuantity((value) => value + 1)}
              className="rounded-full bg-primary-tint text-primary-deep hover:bg-primary-tint"
            >
              <Plus className="size-[18px]" strokeWidth={2.8} />
            </Button>
          </div>
        </Field>

        <Field label="Haltbar bis">
          {inlineExpiry ? (
            today ? (
              <ExpiryPicker
                value={expiryDate}
                onChange={chooseDate}
                // Genau das Flag, das ohnehin schon "der Nutzer hat das Datum
                // selbst angefasst" bedeutet: es entscheidet im Raster
                // zwischen geringelt (Richtwert) und gefüllt (Entscheidung).
                confirmed={dateTouched}
                today={today}
                // Beim Erfassen von Hand gibt es kein Kaufdatum -- gerechnet
                // wird ab heute, und die Zeile über den Sprüngen sagt das.
                reference={today}
                shelfLife={shelfLifeDays ?? DEFAULT_SHELF_LIFE_DAYS}
              />
            ) : (
              // Vor der Hydration gibt es kein "heute" und damit keinen Monat.
              // Der Platzhalter trägt ungefähr die Höhe des Kalenders,
              // damit Notiz und Speichern-Leiste beim Einblenden nicht
              // springen -- exakt geht nicht, ein Monat mit sechs Wochenzeilen
              // ist 43px höher als einer mit fünf. Der Wert wuchs mit der
              // 26px-Kachel und den 38px-Zellen des neuen Kalenders (vorher
              // 430px zu einer 16px-Karte mit 40px-Zellen).
              <div className="h-[460px] animate-pulse rounded-[26px] bg-muted" />
            )
          ) : (
            <button
              type="button"
              onClick={() => setDateSheetOpen(true)}
              className="flex h-16 items-center gap-3 rounded-[18px] border border-border bg-card px-4 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-primary-tint text-primary">
                <CalendarDays className="size-5" strokeWidth={1.8} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-bold">
                  {selectedDate ? formatLong(selectedDate) : "Datum wählen"}
                </span>
                {selectedDate && today && (
                  <span className="mt-0.5 block text-[12.5px] font-medium text-muted-foreground">
                    {expiryLabel(
                      Math.round(
                        (selectedDate.getTime() - today.getTime()) / 86_400_000,
                      ),
                      selectedDate,
                    )}
                  </span>
                )}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-faint"
                strokeWidth={2}
              />
            </button>
          )}
          {shelfLifeDays !== undefined && categoryLabel && (
            // muted-foreground statt faint: der Hinweis ist ein ganzer Satz,
            // nicht nur eine kurze Beschriftung -- genau die Grenze, die
            // globals.css fuer --faint zieht.
            <p className="pl-1.5 text-[12.5px] leading-relaxed font-semibold text-pretty text-muted-foreground">
              {categoryLabel} hält typischerweise{" "}
              {shelfLifeDays > 60
                ? `${Math.round(shelfLifeDays / 30)} Monate`
                : `${shelfLifeDays} Tage`}
              . Der Vorschlag kommt aus deiner Datenbank.
            </p>
          )}
        </Field>

        <Field label="Notiz" htmlFor="note">
          <textarea
            id="note"
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="z. B. Großer Topf, hinten links"
            className="min-h-[76px] resize-none rounded-[22px] bg-card px-[18px] py-3.5 text-[14.5px] font-semibold shadow-row outline-none placeholder:text-faint focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Field>

        {/* Vorher liess sich ein versehentlich angelegter Artikel nur ueber den
            Umweg "als aufgebraucht markieren, dann im Archiv loeschen"
            entfernen -- und verfaelschte dabei die Statistik. */}
        {itemId && (
          <ConfirmDialog
            trigger={
              <Button
                variant="ghost"
                disabled={deleting}
                className="h-12 w-full rounded-lg text-danger"
              >
                <Trash2 className="size-4" />
                Artikel löschen
              </Button>
            }
            title={<>„{name}“ löschen?</>}
            description="Der Artikel verschwindet aus dem Vorrat und taucht auch nicht im Archiv auf."
            confirmLabel="Löschen"
            onConfirm={handleDelete}
          />
        )}
      </div>

      {/* Die Trennlinie faellt weg -- shadow-sheet traegt die Kante der
          Leiste, die von unten hochkommt, wie ueberall sonst im Entwurf. */}
      <div className="sticky bottom-0 rounded-t-[32px] bg-card px-5 pt-4 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-sheet">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-[58px] w-full rounded-[22px] bg-(image:--gradient-primary) font-heading text-[17px] font-bold text-primary-foreground shadow-cta disabled:opacity-60"
        >
          {saving ? "Speichern…" : "Speichern"}
        </button>
      </div>

      {/* Kein Blatt, wo der Kalender schon offen im Feld steht: es gäbe dann
          zwei Wege zu derselben Antwort, und den einen könnte niemand mehr
          öffnen. */}
      {today && !inlineExpiry && (
        <DateSheet
          open={dateSheetOpen}
          onOpenChange={setDateSheetOpen}
          value={expiryDate}
          onChange={chooseDate}
          today={today}
        />
      )}

      <Dialog open={newCategoryOpen} onOpenChange={setNewCategoryOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup>
            <DialogTitle>Neue Kategorie</DialogTitle>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newCategoryLabel">Name</Label>
                <Input
                  id="newCategoryLabel"
                  value={newCategoryLabel}
                  onChange={(e) => setNewCategoryLabel(e.target.value)}
                  placeholder="z. B. Tiefkühl"
                  autoFocus
                  className="h-11 rounded-lg"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="newCategoryShelfLife">Haltbarkeit (Tage)</Label>
                <Input
                  id="newCategoryShelfLife"
                  type="number"
                  min={1}
                  value={newCategoryShelfLife}
                  onChange={(e) => setNewCategoryShelfLife(e.target.value)}
                  className="h-11 rounded-lg"
                />
              </div>
              <Button
                onClick={handleCreateCategory}
                disabled={creatingCategory}
                className="h-11 rounded-lg"
              >
                {creatingCategory ? "Erstellen…" : "Kategorie erstellen"}
              </Button>
            </div>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </div>
  );
}

/**
 * Beschriftung und Feld als eine Einheit. Die Labels stehen im Design in
 * Grossbuchstaben und gesperrt -- das trennt die Fragen ("Wo liegt es?")
 * sichtbar von den Antworten, ohne eine Linie dazwischen zu ziehen.
 */
/**
 * Steht unter einem Feld, dessen Wert nicht der Nutzer gesetzt hat, sondern
 * die Liste selbst -- damit eine Vorauswahl nicht wie eine eigene Eingabe
 * aussieht, die man nur uebersehen hat.
 */
function LearnedHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="pl-1.5 text-xs font-medium text-balance text-faint">
      {children}
    </p>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <label
        htmlFor={htmlFor}
        className={cn(
          // 11,5px-Versalien in --faint, 800 -- Manrope kennt das Gewicht,
          // anders als Quicksand, das nur bis 700 laedt.
          "pl-1.5 text-[11.5px] font-extrabold tracking-[.08em] text-faint uppercase",
          !htmlFor && "pointer-events-none",
        )}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
