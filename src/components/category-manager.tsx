"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Trash2, Plus, X, Check } from "lucide-react";
import type { Category } from "@/db/schema";

export function CategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editShelfLife, setEditShelfLife] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newShelfLife, setNewShelfLife] = useState("14");
  const [saving, setSaving] = useState(false);

  function load() {
    fetch("/api/categories")
      .then((res) => res.json())
      .then(setCategories)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

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
      toast.success("Kategorie aktualisiert");
      setEditingId(null);
      load();
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
      load();
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
      toast.success("Kategorie hinzugefügt");
      setNewLabel("");
      setNewShelfLife("14");
      load();
    } catch {
      toast.error("Konnte Kategorie nicht anlegen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Label>Kategorien</Label>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lädt…</p>
      ) : (
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
      )}

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
