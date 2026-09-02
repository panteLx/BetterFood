"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  ChevronRight,
  CircleDashed,
  Pencil,
  Plus,
  Refrigerator,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet } from "@/components/ui/sheet";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CategoryIcon } from "@/components/category-icon";
import {
  CO2_FACTOR,
  MAX_CO2_GRAMS,
  MAX_PRICE_CENTS,
  PRICE_FACTOR,
  formatEstimateInput,
  parseEstimateInput,
} from "@/lib/estimates";
import type { Category, Place } from "@/db/schema";

export type PlaceWithCount = Place & { itemCount: number };

/**
 * Wie dieser Haushalt seinen Vorrat sortiert -- Fächer und Kategorien auf
 * einem Blatt.
 *
 * Vorher waren das zwei Listen in zwei Reitern für eine einzige Beziehung:
 * in der Kategorie stand ihr Fach, im Fach die Zahl der Artikel, und wer
 * wissen wollte, was wo landet, sprang zwischen beiden hin und her. Hier ist
 * das Fach die Überschrift und die Kategorie die Zeile darunter -- die
 * Zuordnung ist damit zu sehen statt nachzuschlagen, und eine Kategorie in
 * ein anderes Fach zu räumen ist dieselbe Geste wie sie umzubenennen.
 *
 * Kategorien werden von außen gehalten: auf derselben Seite hängt die
 * Produktliste an ihnen. Fächer kommen dagegen mitsamt ihrer Artikelzahl vom
 * Server und werden nach jeder Änderung neu geladen.
 */
export function SortingManager({
  categories,
  places,
  onCategoriesChange,
}: {
  categories: Category[];
  places: PlaceWithCount[];
  onCategoriesChange: (next: Category[]) => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Ein Blatt für beides: eine neue Kategorie und eine bestehende
  // beantworten dieselben drei Fragen (Name, Haltbarkeit, Fach).
  const [categorySheet, setCategorySheet] = useState<
    { mode: "new"; placeId: number | null } | { mode: "edit"; category: Category } | null
  >(null);
  const [formLabel, setFormLabel] = useState("");
  const [formShelfLife, setFormShelfLife] = useState("14");
  const [formPlaceId, setFormPlaceId] = useState<number | null>(null);
  // In Euro und Kilogramm, wie der Nutzer sie tippt -- die Umrechnung auf Cent
  // und Gramm macht erst parseEstimateInput beim Speichern.
  const [formPrice, setFormPrice] = useState("");
  const [formCo2, setFormCo2] = useState("");

  // Das Blatt legt nur noch an. Umbenennen passiert in der Überschrift selbst,
  // genau wie in der Produktliste nebenan -- ein Blatt mit einem einzigen Feld
  // ist drei Gesten (öffnen, tippen, speichern) für eine Änderung, die in eine
  // Zeile passt. Die Kategorie behält ihres: dort ist der Name eines von vier
  // Feldern, und ein zweiter Weg nur zum Namen wäre eine Dublette.
  const [placeSheetOpen, setPlaceSheetOpen] = useState(false);
  const [placeName, setPlaceName] = useState("");

  // Nur die ID, nicht das ganze Fach: nach router.refresh() kommen die Fächer
  // als neue Objekte vom Server, und eine festgehaltene Kopie hätte danach
  // eine veraltete Artikelzahl in die Überschrift zurückgeschrieben.
  const [editingPlaceId, setEditingPlaceId] = useState<number | null>(null);
  const [editPlaceName, setEditPlaceName] = useState("");

  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<Category | null>(null);
  const [pendingDeletePlace, setPendingDeletePlace] = useState<PlaceWithCount | null>(null);

  /**
   * Die Kategorien, gruppiert nach ihrem Standardfach.
   *
   * Über die Fachliste gruppiert und nicht über die Kategorien: zeigt eine
   * Kategorie auf ein Fach, das es nicht mehr gibt -- der Client hält nach
   * dem Löschen noch die alte Zeile, die Datenbank hat "ON DELETE SET NULL"
   * längst ausgeführt --, landet sie unter "Ohne Standardort" statt in
   * einer Karteileiche.
   */
  const groups = useMemo(() => {
    const sorted = [...categories].sort((a, b) => a.label.localeCompare(b.label));
    const known = new Set(places.map((place) => place.id));
    return {
      byPlace: places.map((place) => ({
        place,
        categories: sorted.filter((category) => category.defaultPlaceId === place.id),
      })),
      orphans: sorted.filter(
        (category) => category.defaultPlaceId === null || !known.has(category.defaultPlaceId),
      ),
    };
  }, [categories, places]);

  function openNewCategory(placeId: number | null) {
    setFormLabel("");
    setFormShelfLife("14");
    setFormPlaceId(placeId);
    // Leer und nicht 0: über eine gerade erst erfundene Kategorie kann die
    // App nichts schätzen, und 0 wäre eine Behauptung.
    setFormPrice("");
    setFormCo2("");
    setCategorySheet({ mode: "new", placeId });
  }

  function openEditCategory(category: Category) {
    setFormLabel(category.label);
    setFormShelfLife(String(category.shelfLifeDays));
    setFormPlaceId(category.defaultPlaceId);
    setFormPrice(formatEstimateInput(category.avgPriceCents, PRICE_FACTOR, 2));
    setFormCo2(formatEstimateInput(category.avgCo2Grams, CO2_FACTOR));
    setCategorySheet({ mode: "edit", category });
  }

  function sorted(list: Category[]) {
    return [...list].sort((a, b) => a.label.localeCompare(b.label));
  }

  async function saveCategory() {
    if (!categorySheet) return;
    if (!formLabel.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    const days = Number(formShelfLife);
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Bitte eine gültige Haltbarkeit eingeben.");
      return;
    }

    const price = parseEstimateInput(formPrice, PRICE_FACTOR, MAX_PRICE_CENTS);
    if (price === "invalid") {
      toast.error("Bitte einen gültigen Ø Preis eingeben.");
      return;
    }
    const co2 = parseEstimateInput(formCo2, CO2_FACTOR, MAX_CO2_GRAMS);
    if (co2 === "invalid") {
      toast.error("Bitte einen gültigen Ø CO₂-Wert eingeben.");
      return;
    }

    const body = JSON.stringify({
      label: formLabel.trim(),
      shelfLifeDays: Math.round(days),
      defaultPlaceId: formPlaceId,
      avgPriceCents: price,
      avgCo2Grams: co2,
    });

    setSaving(true);
    try {
      const isNew = categorySheet.mode === "new";
      const res = await fetch(
        isNew ? "/api/categories" : `/api/categories/${categorySheet.category.id}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body,
        },
      );
      if (!res.ok) throw new Error();
      const saved = (await res.json()) as Category;
      onCategoriesChange(sorted([...categories.filter((c) => c.id !== saved.id), saved]));
      setCategorySheet(null);
      toast.success(isNew ? "Kategorie hinzugefügt" : "Kategorie aktualisiert");
    } catch {
      toast.error("Konnte Kategorie nicht speichern.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(category: Category) {
    setPendingDeleteCategory(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Konnte Kategorie nicht löschen.");
      }
      onCategoriesChange(categories.filter((c) => c.id !== category.id));
      toast.success("Kategorie gelöscht");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Konnte Kategorie nicht löschen.",
      );
    } finally {
      setSaving(false);
    }
  }

  /** Fächer liegen samt Artikelzahl auf dem Server -- nach jeder Änderung frisch holen. */
  async function callPlace(input: string, init: RequestInit, success: string, failure: string) {
    setSaving(true);
    try {
      const res = await fetch(input, init);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? failure);
      }
      toast.success(success);
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function createPlace() {
    if (!placeName.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    const ok = await callPlace(
      "/api/places",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: placeName.trim() }),
      },
      "Fach hinzugefügt",
      "Konnte Fach nicht speichern.",
    );
    if (ok) setPlaceSheetOpen(false);
  }

  /**
   * Der Name aus der Überschrift heraus. Bleibt das Feld leer, wird nichts
   * geschickt: ein Fach ohne Namen wäre in der Auswahl beim Erfassen eine
   * leere Zeile, die man nicht mehr zuordnen kann.
   */
  async function renamePlace(place: PlaceWithCount) {
    if (!editPlaceName.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    const ok = await callPlace(
      `/api/places/${place.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editPlaceName.trim() }),
      },
      "Fach gespeichert",
      "Konnte Fach nicht speichern.",
    );
    if (ok) setEditingPlaceId(null);
  }

  async function deletePlace(place: PlaceWithCount) {
    setPendingDeletePlace(null);
    await callPlace(
      `/api/places/${place.id}`,
      { method: "DELETE" },
      `„${place.name}“ entfernt`,
      "Konnte Fach nicht entfernen.",
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="px-1 text-[12.5px] leading-relaxed font-medium text-balance text-muted-foreground">
        Fächer sind die Orte, an denen dein Vorrat liegt; die Kategorien
        darunter landen beim Erfassen standardmäßig dort. Die Haltbarkeit einer
        Kategorie bestimmt das vorgeschlagene MHD – was die App über ein
        einzelnes Produkt gelernt hat, geht beidem vor.
      </p>

      {groups.byPlace.map(({ place, categories: inPlace }) => (
        <section key={place.id} className="flex flex-col gap-2">
          <header className="flex items-center gap-2.5 px-1">
            <span className="flex size-9.5 shrink-0 items-center justify-center rounded-[13px] bg-primary-tint text-primary">
              <Refrigerator className="size-4.5" strokeWidth={1.7} />
            </span>
            {/* Abbrechen setzt nur den Bearbeitungsmodus zurück und fasst
                editPlaceName nicht an -- die Überschrift rendert wieder
                place.name aus den Props, der getippte Zwischenstand ist damit
                verworfen und nicht etwa als leeres Feld stehengeblieben. */}
            {editingPlaceId === place.id ? (
              <>
                {/* Enter speichert, Escape bricht ab -- wie beim Artikelnamen
                    im Review. Das Feld steht in keinem <form>, also täte die
                    Eingabetaste der Bildschirmtastatur sonst schlicht nichts,
                    und man müsste die Tastatur erst wegschieben, um den Haken
                    zu treffen. */}
                <input
                  value={editPlaceName}
                  onChange={(event) => setEditPlaceName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") renamePlace(place);
                    if (event.key === "Escape") setEditingPlaceId(null);
                  }}
                  disabled={saving}
                  autoFocus
                  aria-label="Name des Fachs"
                  className="h-10.5 min-w-0 flex-1 rounded-[13px] border border-primary bg-surface-2 px-3 text-[14.5px] font-bold outline-none"
                />
                <Button
                  size="icon"
                  className="size-10 shrink-0 rounded-[13px]"
                  disabled={saving}
                  onClick={() => renamePlace(place)}
                  aria-label="Speichern"
                >
                  <Check className="size-4.5" strokeWidth={2.4} />
                </Button>
                {/* Auch Abbrechen ist während des Speicherns gesperrt: sonst
                    schließt sich das Feld, die PATCH-Anfrage läuft aber weiter
                    und trägt hinterher genau die Umbenennung ein, die gerade
                    verworfen werden sollte. */}
                <Button
                  size="icon"
                  variant="outline"
                  className="size-10 shrink-0 rounded-[13px]"
                  disabled={saving}
                  onClick={() => setEditingPlaceId(null)}
                  aria-label="Abbrechen"
                >
                  <X className="size-4" strokeWidth={2.3} />
                </Button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] leading-tight font-bold">{place.name}</p>
                  <p className="mt-1 text-xs leading-none font-medium text-muted-foreground">
                    {place.itemCount} Artikel
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  className="size-10 shrink-0 rounded-[13px]"
                  disabled={saving}
                  onClick={() => {
                    setEditingPlaceId(place.id);
                    setEditPlaceName(place.name);
                  }}
                  aria-label={`Fach „${place.name}“ umbenennen`}
                >
                  <Pencil className="size-4" />
                </Button>
                {/* Der Papierkorb geht weiter über den Dialog: ein Fach zu
                    entfernen nimmt den Artikeln darin ihre Zuordnung, und das
                    darf kein Fehlgriff neben dem Stift auslösen. */}
                <Button
                  size="icon"
                  variant="outline"
                  className="size-10 shrink-0 rounded-[13px] text-danger"
                  disabled={saving}
                  onClick={() => setPendingDeletePlace(place)}
                  aria-label={`Fach „${place.name}“ entfernen`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </header>

          <div className="flex flex-col gap-2">
            {inPlace.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                disabled={saving}
                onClick={() => openEditCategory(category)}
              />
            ))}
            <AddRow
              label="Kategorie"
              disabled={saving}
              onClick={() => openNewCategory(place.id)}
            />
          </div>
        </section>
      ))}

      {/* Nur wenn es sie gibt: eine leere Überschrift "Ohne Standardort"
          wäre eine Frage, die niemand gestellt hat. */}
      {groups.orphans.length > 0 && (
        <section className="flex flex-col gap-2">
          <header className="flex items-center gap-2.5 px-1">
            <span className="flex size-9.5 shrink-0 items-center justify-center rounded-[13px] bg-surface-2 text-faint">
              <CircleDashed className="size-4.5" strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] leading-tight font-bold">
                Ohne Standardfach
              </p>
              <p className="mt-1 text-xs leading-none font-medium text-muted-foreground">
                Beim Erfassen wird nichts vorbelegt
              </p>
            </div>
          </header>

          <div className="flex flex-col gap-2">
            {groups.orphans.map((category) => (
              <CategoryRow
                key={category.id}
                category={category}
                disabled={saving}
                onClick={() => openEditCategory(category)}
              />
            ))}
            <AddRow label="Kategorie" disabled={saving} onClick={() => openNewCategory(null)} />
          </div>
        </section>
      )}

      <AddRow
        label="Fach"
        disabled={saving}
        onClick={() => {
          setPlaceName("");
          setPlaceSheetOpen(true);
        }}
      />

      <Sheet
        open={categorySheet !== null}
        onOpenChange={(open) => !open && setCategorySheet(null)}
        title={categorySheet?.mode === "edit" ? categorySheet.category.label : "Neue Kategorie"}
      >
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="categoryLabel">Name</Label>
            <Input
              id="categoryLabel"
              value={formLabel}
              onChange={(event) => setFormLabel(event.target.value)}
              placeholder="z. B. Tiefkühl"
              className="h-12 rounded-lg"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="categoryShelfLife">Haltbarkeit in Tagen</Label>
            <Input
              id="categoryShelfLife"
              type="number"
              min={1}
              value={formShelfLife}
              onChange={(event) => setFormShelfLife(event.target.value)}
              className="h-12 rounded-lg"
            />
          </div>

          {/* Nebeneinander und nicht untereinander: es sind zwei Zahlen zu
              derselben Frage ("was ist ein Artikel hier ungefähr wert?"),
              und einzeln untereinander wäre das Blatt eine Formularwand.
              Beide tragen ein eigenes sichtbares Label und nicht bloß einen
              Platzhalter: sobald ein Wert drinsteht -- und nach dem Seed steht
              überall einer drin -- verschwindet der Platzhalter, und zwei
              nackte Zahlen nebeneinander sagen nicht mehr, welche welche
              ist. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="categoryAvgPrice">Ø Preis in €</Label>
                {/* type="text", nicht type="number": ein Zahlenfeld gibt bei
                    einer Eingabe, die es nicht versteht -- ein Komma reicht --
                    über value den leeren String zurück. Das ist von
                    "bewusst geleert" nicht zu unterscheiden und hätte einen
                    bestehenden Schätzwert stillschweigend gelöscht, statt
                    einen Fehler zu melden. inputMode holt trotzdem die
                    Zifferntastatur. */}
                <Input
                  id="categoryAvgPrice"
                  type="text"
                  inputMode="decimal"
                  placeholder="—"
                  value={formPrice}
                  onChange={(event) => setFormPrice(event.target.value)}
                  className="h-12 rounded-lg"
                />
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="categoryAvgCo2">Ø CO₂ in kg</Label>
                <Input
                  id="categoryAvgCo2"
                  type="text"
                  inputMode="decimal"
                  placeholder="—"
                  value={formCo2}
                  onChange={(event) => setFormCo2(event.target.value)}
                  className="h-12 rounded-lg"
                />
              </div>
            </div>
            <p className="text-xs leading-snug font-medium text-faint">
              Je Artikel. Grundlage der Ersparnis auf der Startseite. Leer
              lassen, wenn die Kategorie zu gemischt ist — sie zählt dann nicht
              mit.
            </p>
          </div>

          {/* Die Fächer als Chips statt als zweitem Blatt: es sind drei bis
              fünf, und ein Blatt über einem Blatt wäre ein Stapel für
              eine Frage, die in eine Zeile passt. */}
          {places.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Standardfach</Label>
              <div className="flex flex-wrap gap-2">
                {places.map((place) => (
                  <Chip
                    key={place.id}
                    active={formPlaceId === place.id}
                    onClick={() => setFormPlaceId(place.id)}
                    className="h-10 px-3"
                  >
                    {place.name}
                  </Chip>
                ))}
                {/* Keiner ist eine gültige Antwort: "Sonstiges" sagt über
                    das Fach nichts aus, und dann soll das Formular auch
                    nichts vorschlagen. */}
                <Chip
                  active={formPlaceId === null}
                  onClick={() => setFormPlaceId(null)}
                  className="h-10 px-3"
                >
                  Keins
                </Chip>
              </div>
            </div>
          )}

          <Button className="mt-1 h-13 rounded-lg text-[15px]" disabled={saving} onClick={saveCategory}>
            {categorySheet?.mode === "edit" ? "Speichern" : "Kategorie anlegen"}
          </Button>

          {categorySheet?.mode === "edit" && (
            <Button
              variant="ghost"
              className="h-12 rounded-lg text-danger"
              disabled={saving}
              onClick={() => {
                const category = categorySheet.category;
                setCategorySheet(null);
                setPendingDeleteCategory(category);
              }}
            >
              <Trash2 className="size-4" />
              Kategorie löschen
            </Button>
          )}
        </div>
      </Sheet>

      <Sheet
        open={placeSheetOpen}
        onOpenChange={(open) => !open && setPlaceSheetOpen(false)}
        title="Neues Fach"
      >
        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="placeName">Name</Label>
            <Input
              id="placeName"
              value={placeName}
              onChange={(event) => setPlaceName(event.target.value)}
              placeholder="z. B. Keller"
              className="h-12 rounded-lg"
            />
          </div>

          <Button
            className="mt-1 h-13 rounded-lg text-[15px]"
            disabled={saving}
            onClick={createPlace}
          >
            Fach anlegen
          </Button>
        </div>
      </Sheet>

      {/* Eine Kategorie zu löschen nimmt alles mit, was die Liste über die
          Produkte darin gelernt hat -- das darf kein einzelner Fehlgriff
          auslösen. */}
      <ConfirmDialog
        open={pendingDeleteCategory !== null}
        onOpenChange={(open) => !open && setPendingDeleteCategory(null)}
        title={<>„{pendingDeleteCategory?.label}“ löschen?</>}
        description="Artikel in dieser Kategorie bleiben im Vorrat. Was die App über die Produkte darin gelernt hat, geht verloren – beim nächsten Erfassen fragt sie erneut."
        confirmLabel="Löschen"
        onConfirm={() => pendingDeleteCategory && deleteCategory(pendingDeleteCategory)}
      />

      <ConfirmDialog
        open={pendingDeletePlace !== null}
        onOpenChange={(open) => !open && setPendingDeletePlace(null)}
        title={<>„{pendingDeletePlace?.name}“ entfernen?</>}
        description={
          pendingDeletePlace?.itemCount
            ? `${pendingDeletePlace.itemCount} Artikel liegen laut App hier. Sie bleiben im Vorrat, verlieren aber ihre Zuordnung – und die Kategorien dieses Fachs schlagen künftig keins mehr vor.`
            : "Das Fach verschwindet aus der Auswahl beim Erfassen, und die Kategorien darin schlagen künftig keins mehr vor."
        }
        confirmLabel="Entfernen"
        onConfirm={() => pendingDeletePlace && deletePlace(pendingDeletePlace)}
      />
    </div>
  );
}

/** Eine Kategorie in ihrem Fach -- die ganze Zeile öffnet die Bearbeitung. */
function CategoryRow({
  category,
  disabled,
  onClick,
}: {
  category: Category;
  disabled: boolean;
  onClick: () => void;
}) {
  // Haltbarkeit, Ø Preis und Ø CO₂ in einer Zeile. Bis eben stand hier nur die
  // Haltbarkeit, obwohl die Kategorie seit den Schätzwerten drei gepflegte
  // Eigenschaften trägt -- wer sie pflegt, sah der Liste also nicht an, welche
  // Kategorie noch leer ist, und musste jede einzeln aufklappen.
  //
  // Fehlende Werte fallen weg, statt als "—" dazustehen: `null` heißt hier
  // nicht "noch nicht gepflegt", sondern "diese Kategorie ist zu gemischt und
  // zählt nicht mit" (siehe lib/estimates.ts). Ein Platzhalter würde einen
  // gültigen Zustand als Lücke anmahnen und obendrein jede solche Zeile mit
  // einem Zeichen füllen, das nichts aussagt.
  //
  // Formatiert über formatEstimateInput, also genau so, wie der Editor die
  // Zahl beim Öffnen in sein Feld schreibt. Andernfalls stünde in der Liste
  // eine andere Schreibweise derselben Zahl als im Formular darunter, und der
  // Nutzer müsste nach dem Speichern prüfen, ob er versehentlich etwas
  // verändert hat. Die Funktion schreibt so kurz wie möglich ("2,5 €", nicht
  // "2,50 €") -- dieselbe Entscheidung wie im Feld, aus demselben Grund.
  const meta = [
    `${category.shelfLifeDays} Tage haltbar`,
    ...(category.avgPriceCents !== null
      ? [`${formatEstimateInput(category.avgPriceCents, PRICE_FACTOR, 2)} €`]
      : []),
    ...(category.avgCo2Grams !== null
      ? [`${formatEstimateInput(category.avgCo2Grams, CO2_FACTOR)} kg`]
      : []),
  ].join(" · ");

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`${category.label} bearbeiten`}
      className="flex items-center gap-2.5 rounded-[18px] border border-border bg-card px-3.5 py-2.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-primary-tint text-primary">
        <CategoryIcon categoryKey={category.key} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] leading-tight font-bold">{category.label}</p>
        <p className="mt-1 text-xs leading-none font-medium text-muted-foreground">{meta}</p>
      </div>
      <ChevronRight className="size-4 shrink-0 text-faint" strokeWidth={2} />
    </button>
  );
}

function AddRow({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-11.5 items-center justify-center gap-1.5 rounded-[18px] border border-dashed border-border text-[13.5px] font-semibold text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
    >
      <Plus className="size-4" strokeWidth={2.4} />
      {label}
    </button>
  );
}
