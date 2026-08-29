"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Plus, X, Check } from "lucide-react";
import type { Category } from "@/db/schema";

/**
 * Der Kategorie-Teil der Wissensdatenbank.
 *
 * Kontrolliert von aussen: auf derselben Seite haengt die Produktliste an
 * denselben Kategorien, und eine gerade umbenannte oder geloeschte Kategorie
 * muss dort sofort stimmen -- mit zwei getrennten Kopien widersprachen sich
 * die beiden Haelften der Seite.
 */
export function CategoryManager({
  categories,
  onCategoriesChange,
}: {
  categories: Category[];
  onCategoriesChange: (next: Category[]) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editShelfLife, setEditShelfLife] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newShelfLife, setNewShelfLife] = useState("14");
  const [saving, setSaving] = useState(false);

  function sorted(list: Category[]) {
    return [...list].sort((a, b) => a.label.localeCompare(b.label));
  }

  function startEdit(category: Category) {
    setEditingId(category.id);
    setEditLabel(category.label);
    setEditShelfLife(String(category.shelfLifeDays));
  }

  async function saveEdit(id: number) {
    if (!editLabel.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    const days = Number(editShelfLife);
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Bitte eine gültige Haltbarkeit eingeben.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel.trim(), shelfLifeDays: Math.round(days) }),
      });
      if (!res.ok) throw new Error();
      const updated = (await res.json()) as Category;
      toast.success("Kategorie aktualisiert");
      setEditingId(null);
      onCategoriesChange(sorted([...categories.filter((c) => c.id !== updated.id), updated]));
    } catch {
      toast.error("Konnte Kategorie nicht aktualisieren.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Konnte Kategorie nicht löschen.");
      }
      toast.success("Kategorie gelöscht");
      onCategoriesChange(categories.filter((c) => c.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Konnte Kategorie nicht löschen.");
    } finally {
      setSaving(false);
    }
  }

  async function addCategory() {
    if (!newLabel.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    const days = Number(newShelfLife);
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Bitte eine gültige Haltbarkeit eingeben.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel.trim(), shelfLifeDays: Math.round(days) }),
      });
      if (!res.ok) throw new Error();
      const created = (await res.json()) as Category;
      toast.success("Kategorie hinzugefügt");
      setNewLabel("");
      setNewShelfLife("14");
      onCategoriesChange(sorted([...categories, created]));
    } catch {
      toast.error("Konnte Kategorie nicht anlegen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Die Haltbarkeit einer Kategorie bestimmt, welches MHD beim Erfassen vorgeschlagen wird.
      </p>

      <div className="flex flex-col gap-2">
        {categories.map((category) => (
          <div
            key={category.id}
            className="flex items-center gap-2 rounded-lg border border-input p-2"
          >
            {editingId === category.id ? (
              <>
                <Input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  className="flex-1"
                  autoFocus
                />
                <Input
                  type="number"
                  min={1}
                  value={editShelfLife}
                  onChange={(e) => setEditShelfLife(e.target.value)}
                  className="w-20"
                />
                <span className="text-xs whitespace-nowrap text-muted-foreground">Tage</span>
                <Button
                  size="icon"
                  variant="outline"
                  disabled={saving}
                  onClick={() => saveEdit(category.id)}
                  aria-label="Speichern"
                >
                  <Check className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  disabled={saving}
                  onClick={() => setEditingId(null)}
                  aria-label="Abbrechen"
                >
                  <X className="size-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{category.label}</p>
                  <p className="text-xs text-muted-foreground">
                    Haltbarkeit: {category.shelfLifeDays} Tage
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="outline"
                  disabled={saving}
                  onClick={() => startEdit(category)}
                  aria-label="Bearbeiten"
                >
                  <Pencil className="size-4" />
                </Button>
                <Button
                  size="icon"
                  variant="outline"
                  disabled={saving}
                  onClick={() => deleteCategory(category.id)}
                  aria-label="Löschen"
                >
                  <Trash2 className="size-4" />
                </Button>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-dashed border-input p-2">
        <Input
          placeholder="Neue Kategorie"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="flex-1"
        />
        <Input
          type="number"
          min={1}
          value={newShelfLife}
          onChange={(e) => setNewShelfLife(e.target.value)}
          className="w-20"
        />
        <span className="text-xs whitespace-nowrap text-muted-foreground">Tage</span>
        <Button size="icon" disabled={saving} onClick={addCategory} aria-label="Hinzufügen">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
