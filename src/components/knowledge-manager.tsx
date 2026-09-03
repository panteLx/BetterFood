"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, Refrigerator, Search, Tags, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tab, TabBar } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { PickerButton, PickerOption } from "@/components/ui/picker";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SortingManager, type PlaceWithCount } from "@/components/sorting-manager";
import { normalizeProductName } from "@/lib/utils";
import type { Category, ProductKnowledge } from "@/db/schema";

type Tabs = "sortierung" | "produkte";

// Zwei Reiter, nicht drei: Faecher und Kategorien beantworten dieselbe Frage
// ("wohin gehoert was?") und standen vorher als zwei Listen nebeneinander,
// die sich gegenseitig zitierten.
const TABS: { value: Tabs; label: string }[] = [
  { value: "sortierung", label: "Sortierung" },
  { value: "produkte", label: "Produkte" },
];

/**
 * Die Wissensdatenbank einer Liste: wie der Haushalt seinen Vorrat sortiert
 * (Faecher und Kategorien) und was die Liste ueber einzelne Produkte gelernt
 * hat.
 *
 * Beides steht hier zusammen, weil es dieselbe Frage beantwortet -- getrennt
 * waeren Kategorien in den Einstellungen und Produkte hier, obwohl ein
 * Produkt ohne seine Kategorie gar nichts aussagt.
 */
export function KnowledgeManager({
  initialEntries,
  initialCategories,
  places,
}: {
  initialEntries: ProductKnowledge[];
  initialCategories: Category[];
  places: PlaceWithCount[];
}) {
  const [tab, setTab] = useState<Tabs>("sortierung");
  const [entries, setEntries] = useState(initialEntries);
  const [categories, setCategories] = useState(initialCategories);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [categoryPickerFor, setCategoryPickerFor] =
    useState<ProductKnowledge | null>(null);
  const [pendingForget, setPendingForget] = useState<ProductKnowledge | null>(
    null,
  );
  const [placePickerFor, setPlacePickerFor] = useState<ProductKnowledge | null>(
    null,
  );

  // Beim Zurueckkehren auf die Seite liefert der Server frische Daten, der
  // State der versteckten Route ueberlebt aber (<Activity>) -- ohne diesen
  // Abgleich stuende hier der Stand von vorhin.
  const [prevEntries, setPrevEntries] = useState(initialEntries);
  if (initialEntries !== prevEntries) {
    setPrevEntries(initialEntries);
    setEntries(initialEntries);
    setCategories(initialCategories);
  }

  const labelByKey = useMemo(
    () => new Map(categories.map((c) => [c.key, c.label])),
    [categories],
  );
  const placeNames = useMemo(
    () => new Map(places.map((place) => [place.id, place.name])),
    [places],
  );

  const visible = useMemo(() => {
    const needle = normalizeProductName(query);
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.nameKey.includes(needle) ||
        (entry.barcode ?? "").includes(query.trim()) ||
        normalizeProductName(labelByKey.get(entry.category) ?? "").includes(
          needle,
        ),
    );
  }, [entries, query, labelByKey]);

  function handleCategoriesChange(next: Category[]) {
    setCategories(next);
    // Eine geloeschte Kategorie nimmt serverseitig die Produkte mit, die auf
    // sie zeigten -- sonst stuenden hier Eintraege mit einer Kategorie, die
    // es nicht mehr gibt.
    const keys = new Set(next.map((c) => c.key));
    setEntries((prev) => prev.filter((entry) => keys.has(entry.category)));
  }

  async function patchEntry(
    id: number,
    body: { name?: string; category?: string; placeId?: number | null },
  ) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/knowledge/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Konnte Eintrag nicht speichern.");
      }
      const updated = (await res.json()) as ProductKnowledge;
      setEntries((prev) =>
        prev.map((entry) => (entry.id === id ? updated : entry)),
      );
      return true;
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Konnte Eintrag nicht speichern.",
      );
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function changeCategory(entry: ProductKnowledge, category: string) {
    setCategoryPickerFor(null);
    if (category === entry.category) return;
    if (await patchEntry(entry.id, { category })) {
      toast.success(`${entry.name} → ${labelByKey.get(category) ?? category}`);
    }
  }

  async function changePlace(entry: ProductKnowledge, placeId: number | null) {
    setPlacePickerFor(null);
    if (placeId === entry.placeId) return;
    if (await patchEntry(entry.id, { placeId })) {
      toast.success(
        placeId === null
          ? `${entry.name} – Ort vergessen`
          : `${entry.name} → ${placeNames.get(placeId) ?? "Ort"}`,
      );
    }
  }

  async function saveName(entry: ProductKnowledge) {
    if (!editName.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    if (await patchEntry(entry.id, { name: editName.trim() })) {
      setEditingId(null);
      toast.success("Eintrag aktualisiert");
    }
  }

  async function forget(entry: ProductKnowledge) {
    setPendingForget(null);
    setBusyId(entry.id);
    try {
      const res = await fetch(`/api/knowledge/${entry.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      toast.success(`${entry.name} vergessen`);
    } catch {
      toast.error("Konnte Eintrag nicht entfernen.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <TabBar>
        {TABS.map((entry) => (
          <Tab
            key={entry.value}
            active={tab === entry.value}
            onClick={() => setTab(entry.value)}
          >
            {entry.label}
          </Tab>
        ))}
      </TabBar>

      {tab === "sortierung" && (
        <SortingManager
          categories={categories}
          places={places}
          onCategoriesChange={handleCategoriesChange}
        />
      )}

      {tab === "produkte" && (
        <div className="flex flex-col gap-3">
          <p className="px-1 text-[12.5px] leading-relaxed font-medium text-balance text-muted-foreground">
            Jedes erfasste Produkt landet hier. Beim nächsten Scan wird die
            Kategorie von hier übernommen – stimmt sie nicht, ändere sie
            einfach.
          </p>

          {entries.length === 0 ? (
            <p className="rounded-[24px] bg-surface-2 p-5 text-[13.5px] leading-relaxed font-medium text-balance text-muted-foreground">
              Noch nichts gelernt. Sobald du den ersten Artikel einer Kategorie
              zuordnest, merkt sich die App das hier.
            </p>
          ) : (
            <>
              <label className="flex h-11.5 items-center gap-2.5 rounded-full bg-card px-4 shadow-row">
                <Search className="size-4 shrink-0 text-faint" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Produkt suchen"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-faint"
                />
              </label>

              {visible.length === 0 ? (
                <p className="rounded-[24px] bg-surface-2 p-5 text-[13.5px] leading-relaxed font-medium text-balance text-muted-foreground">
                  Kein Treffer für „{query.trim()}“.
                </p>
              ) : (
                visible.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-2.5 rounded-[24px] bg-card p-3.5 shadow-row"
                  >
                    <div className="flex items-center gap-2.5">
                      {editingId === entry.id ? (
                        <>
                          <input
                            value={editName}
                            onChange={(event) =>
                              setEditName(event.target.value)
                            }
                            autoFocus
                            aria-label="Name des Produkts"
                            className="h-10.5 min-w-0 flex-1 rounded-lg bg-surface-2 px-3 font-heading text-[14.5px] font-bold ring-[1.5px] ring-primary ring-inset outline-none"
                          />
                          <Button
                            size="icon"
                            className="size-10 shrink-0"
                            disabled={busyId === entry.id}
                            onClick={() => saveName(entry)}
                            aria-label="Speichern"
                          >
                            <Check className="size-4.5" strokeWidth={2.4} />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-10 shrink-0"
                            onClick={() => setEditingId(null)}
                            aria-label="Abbrechen"
                          >
                            <X className="size-4" strokeWidth={2.3} />
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-heading text-[14.5px] leading-tight font-bold">
                              {entry.name}
                            </p>
                            <p className="mt-1.5 font-mono text-[11.5px] leading-none text-faint">
                              {entry.barcode ?? "ohne Barcode"}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-10 shrink-0"
                            onClick={() => {
                              setEditingId(entry.id);
                              setEditName(entry.name);
                            }}
                            aria-label={`${entry.name} umbenennen`}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-10 shrink-0 text-danger"
                            disabled={busyId === entry.id}
                            onClick={() => setPendingForget(entry)}
                            aria-label={`${entry.name} vergessen`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>

                    {/* Kategorie und Ort nebeneinander: beide sind gelernt,
                        beide kommen beim naechsten Erfassen zurueck, und
                        untereinander machten sie jede Zeile doppelt so hoch.
                        Die Symbole sagen, welcher Knopf welche der beiden
                        Fragen beantwortet. */}
                    <div className="flex gap-2">
                      <PickerButton
                        icon={Tags}
                        label={labelByKey.get(entry.category) ?? entry.category}
                        disabled={busyId === entry.id}
                        onClick={() => setCategoryPickerFor(entry)}
                        aria-label={`Kategorie von ${entry.name} ändern`}
                      />
                      {places.length > 0 && (
                        <PickerButton
                          icon={Refrigerator}
                          label={
                            entry.placeId === null
                              ? "Kein Ort"
                              : (placeNames.get(entry.placeId) ?? "Kein Ort")
                          }
                          muted={
                            entry.placeId === null ||
                            !placeNames.has(entry.placeId)
                          }
                          disabled={busyId === entry.id}
                          onClick={() => setPlacePickerFor(entry)}
                          aria-label={`Ort von ${entry.name} ändern`}
                        />
                      )}
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      )}

      {/* Ein Blatt statt eines Dropdowns pro Zeile: bei zehn Kategorien und
          fuenfzig gelernten Produkten waeren das fuenfzig Popups im Baum. */}
      <Sheet
        open={categoryPickerFor !== null}
        onOpenChange={(open) => !open && setCategoryPickerFor(null)}
        title={
          categoryPickerFor
            ? `„${categoryPickerFor.name}“ gehört zu`
            : "Kategorie wählen"
        }
      >
        <div className="flex flex-col gap-1.5">
          {categories.map((category) => (
            <PickerOption
              key={category.id}
              label={category.label}
              selected={categoryPickerFor?.category === category.key}
              onClick={() =>
                categoryPickerFor &&
                changeCategory(categoryPickerFor, category.key)
              }
            />
          ))}
        </div>
      </Sheet>

      <Sheet
        open={placePickerFor !== null}
        onOpenChange={(open) => !open && setPlacePickerFor(null)}
        title={
          placePickerFor ? `„${placePickerFor.name}“ liegt in` : "Ort wählen"
        }
      >
        <div className="flex flex-col gap-1.5">
          {places.map((place) => (
            <PickerOption
              key={place.id}
              label={place.name}
              selected={placePickerFor?.placeId === place.id}
              onClick={() =>
                placePickerFor && changePlace(placePickerFor, place.id)
              }
            />
          ))}
          {/* Ein Produkt ohne gelerntes Fach ist ein gueltiger Zustand: beim
              naechsten Erfassen fragt die App dann wieder danach. */}
          <PickerOption
            label="Kein Ort"
            selected={placePickerFor?.placeId === null}
            onClick={() => placePickerFor && changePlace(placePickerFor, null)}
          />
        </div>
      </Sheet>

      {/* Wie bei Kategorien und Orten: das Vergessen eines Produkts nimmt die
          gelernte Kategorie und den gelernten Ort mit, und beides steht beim
          naechsten Erfassen wieder zur Frage. */}
      <ConfirmDialog
        open={pendingForget !== null}
        onOpenChange={(open) => !open && setPendingForget(null)}
        title={<>„{pendingForget?.name}“ vergessen?</>}
        description="Artikel im Vorrat bleiben unberührt. Beim nächsten Erfassen dieses Produkts schlägt die App weder Kategorie noch Ort vor."
        confirmLabel="Vergessen"
        onConfirm={() => pendingForget && forget(pendingForget)}
      />
    </div>
  );
}
