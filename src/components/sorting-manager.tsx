"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronRight,
  CircleDashed,
  Plus,
  Refrigerator,
  Settings2,
  Trash2,
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
 * Wie dieser Haushalt seinen Vorrat sortiert -- Faecher und Kategorien auf
 * einem Blatt.
 *
 * Vorher waren das zwei Listen in zwei Reitern fuer eine einzige Beziehung:
 * in der Kategorie stand ihr Fach, im Fach die Zahl der Artikel, und wer
 * wissen wollte, was wo landet, sprang zwischen beiden hin und her. Hier ist
 * das Fach die Ueberschrift und die Kategorie die Zeile darunter -- die
 * Zuordnung ist damit zu sehen statt nachzuschlagen, und eine Kategorie in
 * ein anderes Fach zu raeumen ist dieselbe Geste wie sie umzubenennen.
 *
 * Kategorien werden von aussen gehalten: auf derselben Seite haengt die
 * Produktliste an ihnen. Faecher kommen dagegen mitsamt ihrer Artikelzahl vom
 * Server und werden nach jeder Aenderung neu geladen.
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

  // Ein Blatt fuer beides: eine neue Kategorie und eine bestehende
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

  const [placeSheet, setPlaceSheet] = useState<{ place: PlaceWithCount } | "new" | null>(null);
  const [placeName, setPlaceName] = useState("");

  const [pendingDeleteCategory, setPendingDeleteCategory] = useState<Category | null>(null);
  const [pendingDeletePlace, setPendingDeletePlace] = useState<PlaceWithCount | null>(null);

  /**
   * Die Kategorien, gruppiert nach ihrem Standardfach.
   *
   * Ueber die Fachliste gruppiert und nicht ueber die Kategorien: zeigt eine
   * Kategorie auf ein Fach, das es nicht mehr gibt -- der Client haelt nach
   * dem Loeschen noch die alte Zeile, die Datenbank hat "ON DELETE SET NULL"
   * laengst ausgefuehrt --, landet sie unter "Ohne Standardort" statt in
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
    // Leer und nicht 0: ueber eine gerade erst erfundene Kategorie kann die
    // App nichts schaetzen, und 0 waere eine Behauptung.
    setFormPrice("");
    setFormCo2("");
    setCategorySheet({ mode: "new", placeId });
  }

  function openEditCategory(category: Category) {
    setFormLabel(category.label);
    setFormShelfLife(String(category.shelfLifeDays));
    setFormPlaceId(category.defaultPlaceId);
    setFormPrice(formatEstimateInput(category.avgPriceCents, PRICE_FACTOR));
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

  /** Faecher liegen samt Artikelzahl auf dem Server -- nach jeder Aenderung frisch holen. */
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

  async function savePlace() {
    if (!placeSheet) return;
    if (!placeName.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    const isNew = placeSheet === "new";
    const ok = await callPlace(
      isNew ? "/api/places" : `/api/places/${placeSheet.place.id}`,
      {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: placeName.trim() }),
      },
      isNew ? "Fach hinzugefügt" : "Fach gespeichert",
      "Konnte Fach nicht speichern.",
    );
    if (ok) setPlaceSheet(null);
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
                setPlaceName(place.name);
                setPlaceSheet({ place });
              }}
              aria-label={`Fach „${place.name}“ bearbeiten`}
            >
              <Settings2 className="size-4" />
            </Button>
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

      {/* Nur wenn es sie gibt: eine leere Ueberschrift "Ohne Standardort"
          waere eine Frage, die niemand gestellt hat. */}
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
          setPlaceSheet("new");
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
              derselben Frage ("was ist ein Artikel hier ungefaehr wert?"),
              und einzeln untereinander waere das Blatt eine Formularwand.
              Beide tragen ein eigenes sichtbares Label und nicht bloss einen
              Platzhalter: sobald ein Wert drinsteht -- und nach dem Seed steht
              ueberall einer drin -- verschwindet der Platzhalter, und zwei
              nackte Zahlen nebeneinander sagen nicht mehr, welche welche
              ist. */}
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <div className="flex flex-1 flex-col gap-1.5">
                <Label htmlFor="categoryAvgPrice">Ø Preis in €</Label>
                {/* type="text", nicht type="number": ein Zahlenfeld gibt bei
                    einer Eingabe, die es nicht versteht -- ein Komma reicht --
                    ueber value den leeren String zurueck. Das ist von
                    "bewusst geleert" nicht zu unterscheiden und haette einen
                    bestehenden Schaetzwert stillschweigend geloescht, statt
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

          {/* Die Faecher als Chips statt als zweitem Blatt: es sind drei bis
              fuenf, und ein Blatt ueber einem Blatt waere ein Stapel fuer
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
                {/* Keiner ist eine gueltige Antwort: "Sonstiges" sagt ueber
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
        open={placeSheet !== null}
        onOpenChange={(open) => !open && setPlaceSheet(null)}
        title={placeSheet && placeSheet !== "new" ? placeSheet.place.name : "Neues Fach"}
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

          <Button className="mt-1 h-13 rounded-lg text-[15px]" disabled={saving} onClick={savePlace}>
            {placeSheet === "new" ? "Fach anlegen" : "Speichern"}
          </Button>

          {placeSheet && placeSheet !== "new" && (
            <Button
              variant="ghost"
              className="h-12 rounded-lg text-danger"
              disabled={saving}
              onClick={() => {
                const place = placeSheet.place;
                setPlaceSheet(null);
                setPendingDeletePlace(place);
              }}
            >
              <Trash2 className="size-4" />
              Fach entfernen
            </Button>
          )}
        </div>
      </Sheet>

      {/* Eine Kategorie zu loeschen nimmt alles mit, was die Liste ueber die
          Produkte darin gelernt hat -- das darf kein einzelner Fehlgriff
          ausloesen. */}
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

/** Eine Kategorie in ihrem Fach -- die ganze Zeile oeffnet die Bearbeitung. */
function CategoryRow({
  category,
  disabled,
  onClick,
}: {
  category: Category;
  disabled: boolean;
  onClick: () => void;
}) {
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
        <p className="mt-1 text-xs leading-none font-medium text-muted-foreground">
          {category.shelfLifeDays} Tage haltbar
        </p>
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
