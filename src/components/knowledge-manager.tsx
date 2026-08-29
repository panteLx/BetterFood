"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Pencil, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tab, TabBar } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { CategoryManager } from "@/components/category-manager";
import { PlaceManager, type PlaceWithCount } from "@/components/place-manager";
import { normalizeProductName } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Category, ProductKnowledge } from "@/db/schema";

type Tabs = "produkte" | "kategorien" | "orte";

const TABS: { value: Tabs; label: string }[] = [
  { value: "produkte", label: "Produkte" },
  { value: "kategorien", label: "Kategorien" },
  { value: "orte", label: "Orte" },
];

/**
 * Die Wissensdatenbank einer Liste: welche Produkte kennt sie, in welche
 * Kategorie gehoert jedes davon, und in welchen Faechern liegt der Vorrat.
 *
 * Alle drei stehen hier zusammen, weil sie dieselbe Frage beantworten --
 * getrennt waeren Kategorien in den Einstellungen und Produkte hier, obwohl
 * ein Produkt ohne seine Kategorie gar nichts aussagt.
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
  const [tab, setTab] = useState<Tabs>("produkte");
  const [entries, setEntries] = useState(initialEntries);
  const [categories, setCategories] = useState(initialCategories);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [categoryPickerFor, setCategoryPickerFor] = useState<ProductKnowledge | null>(null);

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

  const visible = useMemo(() => {
    const needle = normalizeProductName(query);
    if (!needle) return entries;
    return entries.filter(
      (entry) =>
        entry.nameKey.includes(needle) ||
        (entry.barcode ?? "").includes(query.trim()) ||
        normalizeProductName(labelByKey.get(entry.category) ?? "").includes(needle),
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

  async function patchEntry(id: number, body: { name?: string; category?: string }) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/knowledge/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Konnte Eintrag nicht speichern.");
      }
      const updated = (await res.json()) as ProductKnowledge;
      setEntries((prev) => prev.map((entry) => (entry.id === id ? updated : entry)));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Konnte Eintrag nicht speichern.");
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
    setBusyId(entry.id);
    try {
      const res = await fetch(`/api/knowledge/${entry.id}`, { method: "DELETE" });
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

      {tab === "kategorien" && (
        <CategoryManager categories={categories} onCategoriesChange={handleCategoriesChange} />
      )}

      {tab === "orte" && <PlaceManager places={places} />}

      {tab === "produkte" && (
        <div className="flex flex-col gap-3">
          <p className="px-1 text-[12.5px] leading-relaxed font-medium text-balance text-muted-foreground">
            Jedes erfasste Produkt landet hier. Beim nächsten Scan wird die Kategorie von hier
            übernommen – stimmt sie nicht, ändere sie einfach.
          </p>

          {entries.length === 0 ? (
            <p className="rounded-[18px] border border-dashed border-border p-5 text-[13.5px] leading-relaxed font-medium text-balance text-muted-foreground">
              Noch nichts gelernt. Sobald du den ersten Artikel einer Kategorie zuordnest, merkt
              sich die App das hier.
            </p>
          ) : (
            <>
              <label className="flex h-11.5 items-center gap-2.5 rounded-[15px] border border-border bg-card px-3.5">
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
                <p className="rounded-[18px] border border-dashed border-border p-5 text-[13.5px] leading-relaxed font-medium text-balance text-muted-foreground">
                  Kein Treffer für „{query.trim()}“.
                </p>
              ) : (
                visible.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-2.5 rounded-[20px] border border-border bg-card p-3.5"
                  >
                    <div className="flex items-center gap-2.5">
                      {editingId === entry.id ? (
                        <>
                          <input
                            value={editName}
                            onChange={(event) => setEditName(event.target.value)}
                            autoFocus
                            aria-label="Name des Produkts"
                            className="h-10.5 min-w-0 flex-1 rounded-[13px] border border-primary bg-surface-2 px-3 text-[14.5px] font-bold outline-none"
                          />
                          <Button
                            size="icon"
                            className="size-10 shrink-0 rounded-[13px]"
                            disabled={busyId === entry.id}
                            onClick={() => saveName(entry)}
                            aria-label="Speichern"
                          >
                            <Check className="size-4.5" strokeWidth={2.4} />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-10 shrink-0 rounded-[13px]"
                            onClick={() => setEditingId(null)}
                            aria-label="Abbrechen"
                          >
                            <X className="size-4" strokeWidth={2.3} />
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[14.5px] leading-tight font-bold">
                              {entry.name}
                            </p>
                            <p className="mt-1.5 font-mono text-[11.5px] leading-none text-faint">
                              {entry.barcode ?? "ohne Barcode"}
                            </p>
                          </div>
                          <Button
                            size="icon"
                            variant="outline"
                            className="size-10 shrink-0 rounded-[13px]"
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
                            className="size-10 shrink-0 rounded-[13px] text-danger"
                            disabled={busyId === entry.id}
                            onClick={() => forget(entry)}
                            aria-label={`${entry.name} vergessen`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={busyId === entry.id}
                      onClick={() => setCategoryPickerFor(entry)}
                      className="flex h-11 items-center gap-2.5 rounded-[14px] border border-border bg-surface-2 px-3.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
                    >
                      <span className="flex-1 truncate text-sm font-semibold">
                        {labelByKey.get(entry.category) ?? entry.category}
                      </span>
                      <ChevronDown className="size-4 shrink-0 text-faint" strokeWidth={2.2} />
                    </button>
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
        title={categoryPickerFor ? `„${categoryPickerFor.name}“ gehört zu` : "Kategorie wählen"}
      >
        <div className="flex flex-col gap-1.5">
          {categories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => categoryPickerFor && changeCategory(categoryPickerFor, category.key)}
              className={cn(
                "flex h-13 items-center gap-3 rounded-[18px] border px-3.5 text-left text-[15px] font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                categoryPickerFor?.category === category.key
                  ? "border-primary bg-primary-tint text-primary"
                  : "border-border bg-surface-2",
              )}
            >
              <span className="flex-1 truncate">{category.label}</span>
              {categoryPickerFor?.category === category.key && (
                <Check className="size-5 shrink-0" strokeWidth={2.4} />
              )}
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
