"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { estimateExpiryDate } from "@/lib/categories";
import type { Category } from "@/db/schema";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ItemForm({
  categories,
  itemId,
  initialName = "",
  initialCategory,
  initialExpiryDate,
  initialQuantity = 1,
  barcode,
}: {
  categories: Pick<Category, "key" | "label" | "shelfLifeDays">[];
  itemId?: number;
  initialName?: string;
  initialCategory?: string;
  initialExpiryDate?: Date;
  initialQuantity?: number;
  barcode?: string;
}) {
  const router = useRouter();
  const fallbackCategory = initialCategory ?? categories[0]?.key ?? "";
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(fallbackCategory);
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [dateTouched, setDateTouched] = useState(Boolean(initialExpiryDate));
  const [expiryDate, setExpiryDate] = useState(() => {
    if (initialExpiryDate) return toDateInputValue(initialExpiryDate);
    const shelfLifeDays =
      categories.find((c) => c.key === fallbackCategory)?.shelfLifeDays ?? 14;
    return toDateInputValue(estimateExpiryDate(shelfLifeDays));
  });
  const [saving, setSaving] = useState(false);

  function handleCategoryChange(value: string | null) {
    if (!value) return;
    setCategory(value);
    if (!dateTouched) {
      const shelfLifeDays = categories.find((c) => c.key === value)?.shelfLifeDays ?? 14;
      setExpiryDate(toDateInputValue(estimateExpiryDate(shelfLifeDays)));
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
        <Select
          value={category}
          onValueChange={handleCategoryChange}
          items={categories.map((c) => ({ value: c.key, label: c.label }))}
        >
          <SelectTrigger id="category" className="w-full">
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
    </div>
  );
}
