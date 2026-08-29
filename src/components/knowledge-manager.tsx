"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Barcode, Check, Pencil, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogBackdrop,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogActions,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";
import { CategoryManager } from "@/components/category-manager";
import { cn, normalizeProductName } from "@/lib/utils";
import type { Category, ProductKnowledge } from "@/db/schema";

type Tab = "produkte" | "kategorien";

const TABS: { value: Tab; label: string }[] = [
  { value: "produkte", label: "Produkte" },
  { value: "kategorien", label: "Kategorien" },
];

/**
 * Die Wissensdatenbank einer Liste: welche Produkte kennt sie, und in welche
 * Kategorie gehoert jedes davon.
 *
 * Beide Haelften stehen hier zusammen, weil sie dieselbe Frage beantworten --
 * getrennt waeren Kategorien in den Einstellungen und Produkte hier, obwohl
 * ein Produkt ohne seine Kategorie gar nichts aussagt.
 */
export function KnowledgeManager({
  initialEntries,
  initialCategories,
}: {
  initialEntries: ProductKnowledge[];
  initialCategories: Category[];
}) {
  const [tab, setTab] = useState<Tab>("produkte");
  const [entries, setEntries] = useState(initialEntries);
  const [categories, setCategories] = useState(initialCategories);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

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
        const payload = await res.json().catch(() => null);
        throw new Error(payload?.error ?? "Konnte Eintrag nicht speichern.");
      }
      const updated = (await res.json()) as ProductKnowledge;
      setEntries((prev) => prev.map((entry) => (entry.id === id ? updated : entry)));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Konnte Eintrag nicht speichern.");
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function changeCategory(entry: ProductKnowledge, category: string | null) {
    if (!category || category === entry.category) return;
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
    <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
      <div className="flex rounded-lg bg-muted p-1" role="tablist">
        {TABS.map((entry) => (
          <button
            key={entry.value}
            type="button"
            role="tab"
            aria-selected={tab === entry.value}
            onClick={() => setTab(entry.value)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              tab === entry.value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "kategorien" ? (
        <CategoryManager categories={categories} onCategoriesChange={handleCategoriesChange} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Jedes erfasste Produkt landet hier. Beim nächsten Scan wird die Kategorie von hier
            übernommen – stimmt sie nicht, ändere sie einfach.
          </p>

          {entries.length === 0 ? (
            <p className="rounded-lg border border-dashed border-input p-4 text-sm text-muted-foreground">
              Noch nichts gelernt. Sobald du den ersten Artikel einer Kategorie zuordnest, merkt
              sich die App das hier.
            </p>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Produkt suchen"
                  className="pl-9"
                />
              </div>

              {visible.length === 0 ? (
                <p className="text-sm text-muted-foreground">Kein Treffer für „{query}“.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {visible.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex flex-col gap-2 rounded-lg border border-input p-2"
                    >
                      <div className="flex items-center gap-2">
                        {editingId === entry.id ? (
                          <>
                            <Input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="flex-1"
                              autoFocus
                            />
                            <Button
                              size="icon"
                              variant="outline"
                              disabled={busyId === entry.id}
                              onClick={() => saveName(entry)}
                              aria-label="Speichern"
                            >
                              <Check className="size-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setEditingId(null)}
                              aria-label="Abbrechen"
                            >
                              <X className="size-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{entry.name}</p>
                              {entry.barcode && (
                                <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                                  <Barcode className="size-3" />
                                  {entry.barcode}
                                </p>
                              )}
                            </div>
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => {
                                setEditingId(entry.id);
                                setEditName(entry.name);
                              }}
                              aria-label={`${entry.name} umbenennen`}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger
                                render={
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    disabled={busyId === entry.id}
                                    aria-label={`${entry.name} vergessen`}
                                  />
                                }
                              >
                                <Trash2 className="size-4" />
                              </AlertDialogTrigger>
                              <AlertDialogPortal>
                                <AlertDialogBackdrop />
                                <AlertDialogPopup>
                                  <AlertDialogTitle>Produkt vergessen?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Beim nächsten Erfassen von &quot;{entry.name}&quot; wird keine
                                    Kategorie mehr vorgeschlagen. Artikel im Vorrat und im Archiv
                                    bleiben unberührt.
                                  </AlertDialogDescription>
                                  <AlertDialogActions>
                                    <AlertDialogClose render={<Button variant="outline" />}>
                                      Abbrechen
                                    </AlertDialogClose>
                                    <AlertDialogClose
                                      render={<Button variant="destructive" />}
                                      onClick={() => forget(entry)}
                                    >
                                      Vergessen
                                    </AlertDialogClose>
                                  </AlertDialogActions>
                                </AlertDialogPopup>
                              </AlertDialogPortal>
                            </AlertDialog>
                          </>
                        )}
                      </div>

                      <Select
                        value={entry.category}
                        onValueChange={(value) => changeCategory(entry, value)}
                        disabled={busyId === entry.id}
                        items={categories.map((c) => ({ value: c.key, label: c.label }))}
                      >
                        <SelectTrigger
                          className="w-full"
                          aria-label={`Kategorie von ${entry.name}`}
                        >
                          <SelectValue placeholder="Kategorie wählen" />
                        </SelectTrigger>
                        <SelectContent>
                          {categories.map((c) => (
                            <SelectItem key={c.key} value={c.key}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
