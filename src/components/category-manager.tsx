"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CategoryIcon } from "@/components/category-icon";
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
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);

  function sorted(list: Category[]) {
    return [...list].sort((a, b) => a.label.localeCompare(b.label));
  }

  function validate(label: string, shelfLife: string) {
    if (!label.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return null;
    }
    const days = Number(shelfLife);
    if (!Number.isFinite(days) || days < 1) {
      toast.error("Bitte eine gültige Haltbarkeit eingeben.");
      return null;
    }
    return { label: label.trim(), shelfLifeDays: Math.round(days) };
  }

  async function saveEdit(id: number) {
    const payload = validate(editLabel, editShelfLife);
    if (!payload) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      const updated = (await res.json()) as Category;
      toast.success("Kategorie aktualisiert");
      setEditingId(null);
      onCategoriesChange(
        sorted([...categories.filter((c) => c.id !== updated.id), updated]),
      );
    } catch {
      toast.error("Konnte Kategorie nicht aktualisieren.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCategory(id: number) {
    setPendingDelete(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Konnte Kategorie nicht löschen.");
      }
      toast.success("Kategorie gelöscht");
      onCategoriesChange(categories.filter((c) => c.id !== id));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Konnte Kategorie nicht löschen.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function addCategory() {
    const payload = validate(newLabel, newShelfLife);
    if (!payload) return;
    setSaving(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
    <div className="flex flex-col gap-2.5">
      <p className="px-1 text-[12.5px] leading-relaxed font-medium text-balance text-muted-foreground">
        Die Haltbarkeit einer Kategorie bestimmt, welches MHD beim Erfassen
        vorgeschlagen wird.
      </p>

      {categories.map((category) => (
        <div
          key={category.id}
          className="flex items-center gap-2.5 rounded-[18px] border border-border bg-card px-3.5 py-2.5"
        >
          <span className="flex size-9.5 shrink-0 items-center justify-center rounded-[13px] bg-primary-tint text-primary">
            <CategoryIcon categoryKey={category.key} className="size-4.5" />
          </span>

          {editingId === category.id ? (
            <>
              <input
                value={editLabel}
                onChange={(event) => setEditLabel(event.target.value)}
                autoFocus
                aria-label="Name der Kategorie"
                className="h-10.5 min-w-0 flex-1 rounded-[13px] border border-primary bg-surface-2 px-2.5 text-sm font-bold outline-none"
              />
              <input
                value={editShelfLife}
                onChange={(event) => setEditShelfLife(event.target.value)}
                type="number"
                min={1}
                aria-label="Haltbarkeit in Tagen"
                className="h-10.5 w-14 shrink-0 rounded-[13px] border border-border bg-surface-2 px-2 text-center text-sm font-semibold outline-none"
              />
              <Button
                size="icon"
                className="size-10 shrink-0 rounded-[13px]"
                disabled={saving}
                onClick={() => saveEdit(category.id)}
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
                  {category.label}
                </p>
                <p className="mt-1 text-xs leading-none font-medium text-muted-foreground">
                  Haltbarkeit: {category.shelfLifeDays} Tage
                </p>
              </div>
              <Button
                size="icon"
                variant="outline"
                className="size-10 shrink-0 rounded-[13px]"
                disabled={saving}
                onClick={() => {
                  setEditingId(category.id);
                  setEditLabel(category.label);
                  setEditShelfLife(String(category.shelfLifeDays));
                }}
                aria-label={`${category.label} bearbeiten`}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="size-10 shrink-0 rounded-[13px] text-danger"
                disabled={saving}
                onClick={() => setPendingDelete(category)}
                aria-label={`${category.label} löschen`}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      ))}

      <div className="flex gap-2 rounded-[18px] border border-dashed border-border bg-card p-2.5">
        <input
          value={newLabel}
          onChange={(event) => setNewLabel(event.target.value)}
          placeholder="Neue Kategorie"
          aria-label="Name der neuen Kategorie"
          className="h-11 min-w-0 flex-1 rounded-[14px] border border-border bg-surface-2 px-3.5 text-sm font-semibold outline-none placeholder:text-faint"
        />
        <input
          value={newShelfLife}
          onChange={(event) => setNewShelfLife(event.target.value)}
          type="number"
          min={1}
          aria-label="Haltbarkeit in Tagen"
          className="h-11 w-15 shrink-0 rounded-[14px] border border-border bg-surface-2 px-2.5 text-center text-sm font-semibold outline-none"
        />
        <button
          type="button"
          disabled={saving}
          onClick={addCategory}
          aria-label="Kategorie hinzufügen"
          className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-primary text-primary-foreground disabled:opacity-60"
        >
          <Plus className="size-5" strokeWidth={2.3} />
        </button>
      </div>

      {/* Eine Kategorie zu loeschen nimmt alles mit, was die Liste ueber die
          Produkte darin gelernt hat -- das darf kein einzelner Fehlgriff auf
          ein Muelltonnen-Symbol ausloesen. Dieselbe Rueckfrage wie bei den
          Orten, und eine fuer alle Zeilen statt einer je Zeile. */}
      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title={<>„{pendingDelete?.label}“ löschen?</>}
        description="Artikel in dieser Kategorie bleiben im Vorrat. Was die App über die Produkte darin gelernt hat, geht verloren – beim nächsten Erfassen fragt sie erneut."
        confirmLabel="Löschen"
        onConfirm={() => pendingDelete && deleteCategory(pendingDelete.id)}
      />
    </div>
  );
}
