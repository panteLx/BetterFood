"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, ChevronRight, Minus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Chip } from "@/components/ui/chip";
import { DateSheet } from "@/components/date-sheet";
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
  expiryLabel,
  formatLong,
  fromDateInputValue,
  toDateInputValue,
} from "@/lib/expiry";
import { useIsClient } from "@/lib/use-is-client";
import { cn } from "@/lib/utils";
import type { Category, Place, ProductKnowledge } from "@/db/schema";

// Wie viele bereits gelernte Produkte als Vorschlag unter dem Namensfeld
// stehen. Mehr als drei fuellen auf dem Telefon eine ganze Zeile und
// verdraengen die Frage, die darunter kommt.
const SUGGESTION_COUNT = 3;

type CategoryOption = Pick<Category, "key" | "label" | "shelfLifeDays">;
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
}) {
  const router = useRouter();
  const [categoryList, setCategoryList] = useState<CategoryOption[]>(categories);
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
    const shelfLife = categoryList.find((c) => c.key === fallbackCategory)?.shelfLifeDays;
    // Ohne Kategorie gibt es nichts zu schaetzen -- das Feld fuellt sich,
    // sobald eine gewaehlt ist.
    return shelfLife === undefined ? "" : toDateInputValue(estimateExpiryDate(shelfLife));
  }

  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(fallbackCategory);
  const [placeId, setPlaceId] = useState<number | null>(initialPlaceId);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [note, setNote] = useState(initialNote);
  const [dateTouched, setDateTouched] = useState(Boolean(initialExpiryDate));
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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryShelfLife, setNewCategoryShelfLife] = useState("14");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const isClient = useIsClient();

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
      setDateTouched(Boolean(initialExpiryDate));
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
      if (options.withName && known.name && !nameTouchedRef.current) setName(known.name);
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

  // Was die Liste schon kennt, als Vorschlag unter dem leeren Namensfeld:
  // "Reste vom Abendessen" tippt niemand gern zweimal.
  useEffect(() => {
    if (itemId || barcode) return;
    let active = true;
    fetch("/api/knowledge")
      .then((res) => (res.ok ? res.json() : []))
      .then((entries: ProductKnowledge[]) => {
        if (!active) return;
        setSuggestions(
          [...entries]
            .sort((a, b) => Number(new Date(b.updatedAt)) - Number(new Date(a.updatedAt)))
            .slice(0, SUGGESTION_COUNT)
            .map((entry) => entry.name),
        );
      })
      .catch(() => {
        // Ohne Vorschlaege tippt man eben -- kein Fehler, der jemanden interessiert.
      });
    return () => {
      active = false;
    };
  }, [itemId, barcode]);

  function leave(target?: string) {
    const destination = target ?? redirectTo;
    if (destination) router.push(destination);
    else router.back();
  }

  function applyCategory(value: string, list: CategoryOption[] = categoryList) {
    setCategory(value);
    if (!dateTouched) {
      const shelfLifeDays = list.find((c) => c.key === value)?.shelfLifeDays ?? 14;
      setExpiryDate(toDateInputValue(estimateExpiryDate(shelfLifeDays)));
    }
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
    applyCategory(value);
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
        body: JSON.stringify({ label: newCategoryLabel.trim(), shelfLifeDays: Math.round(days) }),
      });
      if (!res.ok) throw new Error();
      const created = (await res.json()) as Category;
      const nextList = [...categoryList, created].sort((a, b) => a.label.localeCompare(b.label));
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

      const saved = (await res.json()) as { merged?: boolean; quantity?: number };
      // Reset erst beim Verstecken durch Activity, siehe shouldResetRef.
      shouldResetRef.current = true;

      // Statt einer Meldung, die nach vier Sekunden verschwindet: ein Screen,
      // der die naechste Entscheidung anbietet. Nach dem Einkauf ist der
      // naechste Artikel der Normalfall, nicht die Ausnahme.
      const params = new URLSearchParams({
        name: name.trim(),
        date: expiryDate,
        method: barcode ? "scan" : "manual",
      });
      if (saved.merged && saved.quantity) params.set("merged", String(saved.quantity));
      router.push(`/saved?${params}`);
      router.refresh();
    } catch {
      toast.error("Konnte Artikel nicht speichern.");
    } finally {
      setSaving(false);
    }
  }

  const placeLearned = learnedPlace !== null && learnedPlace === placeId;
  const categoryLearned = learnedCategory !== null && learnedCategory === category && category !== "";
  const shelfLifeDays = categoryList.find((c) => c.key === category)?.shelfLifeDays;
  const categoryLabel = categoryList.find((c) => c.key === category)?.label;
  const selectedDate = expiryDate ? fromDateInputValue(expiryDate) : null;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-5 px-5 pt-2 pb-5">
        <div className="flex items-center gap-2.5">
          <Button
            variant="ghost"
            size="icon-touch"
            aria-label="Zurück"
            onClick={() => leave()}
            className="-ml-2 rounded-2xl"
          >
            <ArrowLeft className="size-5.5" />
          </Button>
          <h1 className="text-xl leading-tight">{title}</h1>
        </div>

        <Field label="Was ist es?" htmlFor="name">
          <Input
            id="name"
            value={name}
            onChange={(event) => handleNameChange(event.target.value)}
            placeholder="z. B. Feldsalat"
            autoFocus={!itemId && !initialName}
            className="h-14 rounded-[18px] border-border bg-card px-4 text-base font-semibold"
          />
          {!itemId && !name && suggestions.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-0.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleNameChange(suggestion)}
                  className="h-8.5 rounded-[10px] border border-dashed border-border bg-surface-2 px-3 text-[13px] font-semibold text-muted-foreground"
                >
                  {suggestion}
                </button>
              ))}
            </div>
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
                  className="h-10 flex-1 px-2.5 text-xs"
                >
                  {place.name}
                </Chip>
              ))}
            </div>
            {/* Sind beide Felder uebernommen, sagt es der Hinweis unter der
                Kategorie in einem Satz -- zweimal derselbe Satz untereinander
                liest sich wie ein Fehler. */}
            {placeLearned && !categoryLearned && (
              <LearnedHint>Der Ort stammt aus deinem letzten Eintrag zu diesem Artikel.</LearnedHint>
            )}
          </Field>
        )}

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
              className="inline-flex h-[34px] items-center gap-1 rounded-[10px] border border-dashed border-border px-3 text-[12.5px] font-semibold text-primary"
            >
              <Plus className="size-3.5" strokeWidth={2.4} />
              Neue Kategorie
            </button>
          </div>
          {categoryLearned && (
            <LearnedHint>
              {placeLearned ? "Ort und Kategorie stammen" : "Die Kategorie stammt"} aus deinem
              letzten Eintrag zu diesem Artikel.
            </LearnedHint>
          )}
        </Field>

        <Field label="Menge">
          <div className="flex h-14 w-fit items-center gap-1 rounded-[18px] border border-border bg-card px-1.5">
            <Button
              variant="ghost"
              size="icon-touch"
              aria-label="Menge verringern"
              disabled={quantity <= 1}
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
              className="rounded-2xl"
            >
              <Minus className="size-5" />
            </Button>
            <span className="w-10 text-center text-lg font-bold tabular-nums">{quantity}</span>
            <Button
              variant="ghost"
              size="icon-touch"
              aria-label="Menge erhöhen"
              onClick={() => setQuantity((value) => value + 1)}
              className="rounded-2xl"
            >
              <Plus className="size-5" />
            </Button>
          </div>
        </Field>

        <Field label="Haltbar bis">
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
              {selectedDate && isClient && (
                <span className="mt-0.5 block text-[12.5px] font-medium text-muted-foreground">
                  {expiryLabel(
                    Math.round(
                      (selectedDate.getTime() - startOfDay(new Date()).getTime()) / 86_400_000,
                    ),
                    selectedDate,
                  )}
                </span>
              )}
            </span>
            <ChevronRight className="size-4 shrink-0 text-faint" strokeWidth={2} />
          </button>
          {shelfLifeDays !== undefined && categoryLabel && (
            <p className="pl-1 text-[12.5px] leading-relaxed font-medium text-balance text-faint">
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
            className="resize-none rounded-[18px] border border-border bg-card px-4 py-3 text-[15px] font-medium outline-none placeholder:text-faint focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </Field>

        {/* Vorher liess sich ein versehentlich angelegter Artikel nur ueber den
            Umweg "als aufgebraucht markieren, dann im Archiv loeschen"
            entfernen -- und verfaelschte dabei die Statistik. */}
        {itemId && (
          <ConfirmDialog
            trigger={
              <Button variant="ghost" disabled={deleting} className="h-12 w-full rounded-lg text-danger">
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

      <div className="sticky bottom-0 border-t border-border bg-card px-5 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-14 w-full rounded-lg bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
        >
          {saving ? "Speichern…" : "Speichern"}
        </button>
      </div>

      {isClient && (
        <DateSheet
          open={dateSheetOpen}
          onOpenChange={setDateSheetOpen}
          value={expiryDate}
          onChange={(value) => {
            setDateTouched(true);
            setExpiryDate(value);
          }}
          today={startOfDay(new Date())}
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

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
  return <p className="pl-1 text-xs font-medium text-balance text-faint">{children}</p>;
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
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className={cn(
          "pl-1 text-xs font-semibold tracking-wider text-muted-foreground uppercase",
          !htmlFor && "pointer-events-none",
        )}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
