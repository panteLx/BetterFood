"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { estimateExpiryDate } from "@/lib/categories";
import type { Category } from "@/db/schema";

const NEW_CATEGORY_VALUE = "__new__";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type CategoryOption = Pick<Category, "key" | "label" | "shelfLifeDays">;

export function ItemForm({
  categories,
  itemId,
  initialName = "",
  initialCategory,
  initialExpiryDate,
  initialQuantity = 1,
  barcode,
  addedBy,
}: {
  categories: CategoryOption[];
  itemId?: number;
  initialName?: string;
  initialCategory?: string;
  initialExpiryDate?: Date;
  initialQuantity?: number;
  barcode?: string;
  addedBy?: { name: string; email: string } | null;
}) {
  const router = useRouter();
  const [categoryList, setCategoryList] = useState<CategoryOption[]>(categories);
  const fallbackCategory = initialCategory ?? categoryList[0]?.key ?? "";
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(fallbackCategory);
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [dateTouched, setDateTouched] = useState(Boolean(initialExpiryDate));
  const [expiryDate, setExpiryDate] = useState(() => {
    if (initialExpiryDate) return toDateInputValue(initialExpiryDate);
    const shelfLifeDays =
      categoryList.find((c) => c.key === fallbackCategory)?.shelfLifeDays ?? 14;
    return toDateInputValue(estimateExpiryDate(shelfLifeDays));
  });
  const [saving, setSaving] = useState(false);

  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryShelfLife, setNewCategoryShelfLife] = useState("14");
  const [creatingCategory, setCreatingCategory] = useState(false);

  function applyCategory(value: string, list: CategoryOption[] = categoryList) {
    setCategory(value);
    if (!dateTouched) {
      const shelfLifeDays = list.find((c) => c.key === value)?.shelfLifeDays ?? 14;
      setExpiryDate(toDateInputValue(estimateExpiryDate(shelfLifeDays)));
    }
  }

  function openNewCategoryDialog() {
    setNewCategoryLabel("");
    setNewCategoryShelfLife("14");
    setNewCategoryOpen(true);
  }

  function handleCategoryChange(value: string | null) {
    if (!value) return;
    if (value === NEW_CATEGORY_VALUE) {
      openNewCategoryDialog();
      return;
    }
    applyCategory(value);
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
      applyCategory(created.key, nextList);
      setNewCategoryOpen(false);
      toast.success("Kategorie erstellt");
    } catch {
      toast.error("Konnte Kategorie nicht anlegen.");
    } finally {
      setCreatingCategory(false);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    if (!category) {
      toast.error("Bitte eine Kategorie wählen.");
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 1) {
      toast.error("Bitte eine gültige Menge eingeben.");
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
          quantity: Math.round(qty),
          expiryDate: new Date(expiryDate).toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Speichern fehlgeschlagen");

      toast.success(itemId ? `${name} aktualisiert` : `${name} hinzugefügt`);
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Konnte Artikel nicht speichern.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      {itemId && (
        <p className="text-xs text-muted-foreground">
          Hinzugefügt von {addedBy ? `${addedBy.name} (${addedBy.email})` : "Unbekannt"}
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Vollmilch 3,5%"
          autoFocus
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category">Kategorie</Label>
        {categoryList.length === 0 ? (
          <Button
            type="button"
            variant="outline"
            className="w-full justify-start"
            onClick={openNewCategoryDialog}
          >
            <Plus className="size-4" />
            Erste Kategorie erstellen
          </Button>
        ) : (
          <Select
            value={category}
            onValueChange={handleCategoryChange}
            items={[
              ...categoryList.map((c) => ({ value: c.key, label: c.label })),
              { value: NEW_CATEGORY_VALUE, label: "Neue Kategorie erstellen" },
            ]}
          >
            <SelectTrigger id="category" className="w-full">
              <SelectValue placeholder="Kategorie wählen" />
            </SelectTrigger>
            <SelectContent>
              {categoryList.map((c) => (
                <SelectItem key={c.key} value={c.key}>
                  {c.label}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value={NEW_CATEGORY_VALUE} className="text-primary">
                <Plus className="size-3.5" />
                Neue Kategorie erstellen
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="quantity">Menge</Label>
        <Input
          id="quantity"
          type="number"
          min={1}
          step={1}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expiry">Haltbar bis (MHD)</Label>
        <Input
          id="expiry"
          type="date"
          value={expiryDate}
          onChange={(e) => {
            setDateTouched(true);
            setExpiryDate(e.target.value);
          }}
        />
        <p className="text-xs text-muted-foreground">
          Automatisch geschätzt anhand der Kategorie – bei Bedarf anpassen.
        </p>
      </div>

      <div className="mt-auto flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => router.push("/")}>
          Abbrechen
        </Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? "Speichern…" : "Speichern"}
        </Button>
      </div>

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
                  placeholder="z.B. Tiefkühl"
                  autoFocus
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
                />
              </div>
              <Button onClick={handleCreateCategory} disabled={creatingCategory}>
                {creatingCategory ? "Erstellen…" : "Kategorie erstellen"}
              </Button>
            </div>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
