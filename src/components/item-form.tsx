"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
  redirectTo,
}: {
  categories: CategoryOption[];
  itemId?: number;
  initialName?: string;
  initialCategory?: string;
  initialExpiryDate?: Date;
  initialQuantity?: number;
  barcode?: string;
  addedBy?: { name: string; email: string } | null;
  // Nur fuer Formulare ausserhalb der Modal-Routen (z.B. /confirm nach dem
  // Scannen, erreicht per echter Navigation von /scan aus): dort landet
  // router.back() auf der Kamera-Seite statt auf der Startseite. Wenn
  // gesetzt, wird stattdessen dorthin navigiert (wie vor Einfuehrung des
  // Modal-Routings).
  redirectTo?: string;
}) {
  const router = useRouter();
  const [categoryList, setCategoryList] = useState<CategoryOption[]>(categories);
  const fallbackCategory = initialCategory ?? categoryList[0]?.key ?? "";

  // Lazy, nicht als Render-Ausdruck: estimateExpiryDate ruft new Date() auf,
  // und ein "unstable value" waehrend des Prerenders laesst Next die Route
  // abbrechen (siehe nextjs.org/docs/messages/blocking-prerender-current-time).
  function initialExpiryValue() {
    if (initialExpiryDate) return toDateInputValue(initialExpiryDate);
    const shelfLifeDays =
      categoryList.find((c) => c.key === fallbackCategory)?.shelfLifeDays ?? 14;
    return toDateInputValue(estimateExpiryDate(shelfLifeDays));
  }

  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(fallbackCategory);
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [dateTouched, setDateTouched] = useState(Boolean(initialExpiryDate));
  const [expiryDate, setExpiryDate] = useState(initialExpiryValue);
  const [saving, setSaving] = useState(false);

  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryShelfLife, setNewCategoryShelfLife] = useState("14");
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Nach einem erfolgreichen Speichern muss das Formular zurueckgesetzt
  // werden: Cache Components unmountet die verlassene Route nicht, sondern
  // versteckt sie via <Activity>, der State ueberlebt also (siehe
  // node_modules/next/dist/docs/01-app/02-guides/preserving-ui-state.md).
  //
  // Zurueckgesetzt wird auf die initial*-Props, NICHT auf leere Werte: auf
  // /confirm kommt der Produktname vom Server, und wer nach dem Speichern
  // per Browser-Zurueck auf dieselbe URL zurueckkehrt, bekommt genau diese
  // Instanz wieder zu sehen - mit einem harten "" stand das Namensfeld dann
  // leer da, bis man die Seite neu lud.
  //
  // Der Reset laeuft im useLayoutEffect-Cleanup, also erst beim Verstecken,
  // damit die noch sichtbare Seite waehrend der Wegnavigation nicht kurz
  // leer aufblitzt.
  const shouldResetRef = useRef(false);
  const resetToInitialRef = useRef<() => void>(undefined);

  // Nach jedem Render aktualisiert, damit der Cleanup unten die aktuellen
  // Props/Kategorien sieht, ohne selbst von ihnen abzuhaengen (eine
  // Dependency wuerde den Cleanup schon bei einer neu angelegten Kategorie
  // ausloesen und das Formular mitten in der Eingabe zuruecksetzen).
  useEffect(() => {
    resetToInitialRef.current = () => {
      setName(initialName);
      setCategory(fallbackCategory);
      setQuantity(String(initialQuantity));
      setDateTouched(Boolean(initialExpiryDate));
      setExpiryDate(initialExpiryValue());
    };
  });

  useLayoutEffect(() => {
    return () => {
      if (!shouldResetRef.current) return;
      shouldResetRef.current = false;
      resetToInitialRef.current?.();
    };
  }, []);

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
      if (!itemId) {
        // Reset erst beim Verstecken durch Activity, siehe shouldResetRef.
        shouldResetRef.current = true;
      }
      if (redirectTo) {
        router.push(redirectTo);
      } else {
        router.back();
      }
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
        <Button
          variant="outline"
          className="flex-1"
          onClick={() => (redirectTo ? router.push(redirectTo) : router.back())}
        >
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
