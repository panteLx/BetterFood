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
import { CATEGORY_LABELS, estimateExpiryDate } from "@/lib/categories";

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function ItemForm({
  initialName = "",
  initialCategory = "sonstiges",
  initialExpiryDate,
  barcode,
}: {
  initialName?: string;
  initialCategory?: string;
  initialExpiryDate?: Date;
  barcode?: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(initialCategory);
  const [dateTouched, setDateTouched] = useState(Boolean(initialExpiryDate));
  const [expiryDate, setExpiryDate] = useState(
    toDateInputValue(initialExpiryDate ?? estimateExpiryDate(initialCategory)),
  );
  const [saving, setSaving] = useState(false);

  function handleCategoryChange(value: string | null) {
    if (!value) return;
    setCategory(value);
    if (!dateTouched) {
      setExpiryDate(toDateInputValue(estimateExpiryDate(value)));
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category,
          barcode,
          expiryDate: new Date(expiryDate).toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Speichern fehlgeschlagen");

      toast.success(`${name} hinzugefügt`);
      router.push("/");
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
        <Select value={category} onValueChange={handleCategoryChange}>
          <SelectTrigger id="category" className="w-full">
            <SelectValue placeholder="Kategorie wählen" />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
