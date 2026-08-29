"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, Plus, Trash2 } from "lucide-react";
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
import { estimateExpiryDate } from "@/lib/categories";
import type { Category } from "@/db/schema";

const NEW_CATEGORY_VALUE = "__new__";

// Schnellauswahl statt Datumsrad: fuer frische Ware ist "+3 Tage" schneller
// als jede Radbedienung, und fuer Lagerware trifft "1 Monat" meist besser als
// die Kategorie-Schaetzung.
const QUICK_DATES = [
  { label: "+3 Tage", days: 3 },
  { label: "1 Woche", days: 7 },
  { label: "1 Monat", days: 30 },
] as const;

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
  showScanNext = false,
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
  // Scannen, erreicht per echter Navigation von /scan aus, oder /add als
  // Vollseite ueber einen Deep-Link): dort landet router.back() auf der
  // Kamera-Seite oder sogar ausserhalb der App. Wenn gesetzt, wird
  // stattdessen dorthin navigiert.
  redirectTo?: string;
  // Zeigt zusaetzlich "Speichern & weiter scannen": nach dem Einkauf ist der
  // naechste Artikel der Normalfall, nicht die Ausnahme.
  showScanNext?: boolean;
}) {
  const router = useRouter();
  const [categoryList, setCategoryList] = useState<CategoryOption[]>(categories);
  // Kein Raten mehr: kennt die Liste dieses Produkt noch nicht, bleibt die
  // Kategorie leer und der Nutzer entscheidet einmal selbst. Ab dem zweiten
  // Mal kommt die Vorauswahl aus genau dieser Entscheidung (siehe
  // applyKnownProduct). Eine geratene Kategorie war teurer als gar keine:
  // sie sah richtig aus und brachte eine falsche Haltbarkeit gleich mit.
  const fallbackCategory = initialCategory ?? "";

  // Lazy, nicht als Render-Ausdruck: estimateExpiryDate ruft new Date() auf,
  // und ein "unstable value" waehrend des Prerenders laesst Next die Route
  // abbrechen (siehe nextjs.org/docs/messages/blocking-prerender-current-time).
  function initialExpiryValue() {
    if (initialExpiryDate) return toDateInputValue(initialExpiryDate);
    const shelfLife = categoryList.find((c) => c.key === fallbackCategory)?.shelfLifeDays;
    // Ohne Kategorie gibt es nichts zu schaetzen -- das Feld fuellt sich,
    // sobald eine gewaehlt ist.
    return shelfLife === undefined ? "" : toDateInputValue(estimateExpiryDate(shelfLife));
  }

  const [name, setName] = useState(initialName);
  const [category, setCategory] = useState(fallbackCategory);
  const [quantity, setQuantity] = useState(String(initialQuantity));
  const [dateTouched, setDateTouched] = useState(Boolean(initialExpiryDate));
  const [expiryDate, setExpiryDate] = useState(initialExpiryValue);
  const [saving, setSaving] = useState(false);
  // Sobald der Nutzer selbst gewaehlt hat, wird nichts mehr ueberschrieben.
  const categoryTouchedRef = useRef(false);
  const nameTouchedRef = useRef(false);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [learnedCategory, setLearnedCategory] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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
      categoryTouchedRef.current = false;
      nameTouchedRef.current = false;
      setLearnedCategory(null);
    };
  });

  useLayoutEffect(() => {
    return () => {
      if (!shouldResetRef.current) return;
      shouldResetRef.current = false;
      resetToInitialRef.current?.();
    };
  }, []);

  /**
   * Fragt nach, ob diese Liste das Produkt schon kennt, und uebernimmt die
   * damalige Entscheidung. Das ersetzt das frühere Raten aus den
   * Open-Food-Facts-Kategorien vollstaendig.
   */
  async function applyKnownProduct(
    lookup: { barcode?: string; name?: string },
    options: { withName: boolean },
  ) {
    if (itemId || categoryTouchedRef.current) return;

    const params = new URLSearchParams();
    if (lookup.barcode) params.set("barcode", lookup.barcode);
    if (lookup.name?.trim()) params.set("name", lookup.name.trim());
    if (params.size === 0) return;

    try {
      const res = await fetch(`/api/items/known?${params}`);
      if (!res.ok) return;
      const known = (await res.json()) as {
        found: boolean;
        category?: string;
        name?: string;
      };
      // In der Zwischenzeit koennte der Nutzer selbst gewaehlt haben.
      if (!known.found || !known.category || categoryTouchedRef.current) return;

      setLearnedCategory(known.category);
      applyCategory(known.category);
      if (options.withName && known.name && !nameTouchedRef.current) setName(known.name);
    } catch {
      // Ohne Antwort bleibt es bei der leeren Vorauswahl -- kein Grund, dem
      // Nutzer etwas anzuzeigen.
    }
  }

  // Laeuft nicht nur beim ersten Rendern, sondern bei jedem erneuten Anzeigen:
  // <Activity> baut die Effekte einer versteckten Seite ab und beim
  // Wiederanzeigen neu auf, waehrend der State erhalten bleibt. Genau das
  // fehlte vorher -- nach dem Speichern eines Artikels zeigte derselbe
  // Barcode beim naechsten Scan noch den Stand von davor.
  const showLookupRef = useRef<() => void>(undefined);
  useEffect(() => {
    showLookupRef.current = () => {
      void applyKnownProduct({ barcode, name }, { withName: true });
    };
  });
  useEffect(() => {
    showLookupRef.current?.();
    return () => {
      if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    };
  }, []);

  function handleNameChange(value: string) {
    nameTouchedRef.current = true;
    setName(value);
    if (itemId) return;
    // Auch von Hand eingetragene Artikel sollen wiedererkannt werden -- dort
    // gibt es keinen Barcode, nur den Namen.
    if (nameDebounceRef.current) clearTimeout(nameDebounceRef.current);
    nameDebounceRef.current = setTimeout(() => {
      void applyKnownProduct({ barcode, name: value }, { withName: false });
    }, 500);
  }

  function leave(target?: string) {
    const destination = target ?? redirectTo;
    if (destination) router.push(destination);
    else router.back();
  }

  function applyCategory(value: string, list: CategoryOption[] = categoryList) {
    setCategory(value);
    if (!dateTouched) {
      const shelfLifeDays = list.find((c) => c.key === value)?.shelfLifeDays ?? 14;
      setExpiryDate(toDateInputValue(estimateExpiryDate(shelfLifeDays)));
    }
  }

  function applyQuickDate(days: number) {
    setDateTouched(true);
    setExpiryDate(toDateInputValue(estimateExpiryDate(days)));
  }

  function openNewCategoryDialog() {
    setNewCategoryLabel("");
    setNewCategoryShelfLife("14");
    setNewCategoryOpen(true);
  }

  function handleCategoryChange(value: string | null) {
    if (!value) return;
    categoryTouchedRef.current = true;
    setLearnedCategory(null);
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

  async function handleDelete() {
    if (!itemId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/items/${itemId}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`${name} gelöscht`);
      leave();
      router.refresh();
    } catch {
      toast.error("Konnte Artikel nicht löschen.");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave(nextTarget?: string) {
    if (!name.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    if (!category) {
      toast.error("Bitte eine Kategorie wählen.");
      return;
    }
    if (!expiryDate) {
      toast.error("Bitte ein Haltbarkeitsdatum wählen.");
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

      const saved = (await res.json()) as { merged?: boolean; quantity?: number };

      if (itemId) {
        toast.success(`${name} aktualisiert`);
      } else if (saved.merged) {
        // Der Artikel lag schon mit demselben MHD im Vorrat -- der Nutzer soll
        // sehen, dass nichts verloren ging, sondern zusammengezaehlt wurde.
        toast.success(`${name} – jetzt ${saved.quantity}× im Vorrat`);
      } else {
        toast.success(`${name} hinzugefügt`);
      }

      if (!itemId) {
        // Reset erst beim Verstecken durch Activity, siehe shouldResetRef.
        shouldResetRef.current = true;
      }
      leave(nextTarget);
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
          onChange={(e) => handleNameChange(e.target.value)}
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
        {learnedCategory === category && category !== "" && (
          <p className="text-xs text-muted-foreground">
            Übernommen aus deinem letzten Eintrag zu diesem Artikel.
          </p>
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
        <div className="flex flex-wrap gap-1.5">
          {QUICK_DATES.map((quick) => (
            <Button
              key={quick.days}
              type="button"
              size="sm"
              variant="outline"
              onClick={() => applyQuickDate(quick.days)}
            >
              {quick.label}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Automatisch geschätzt anhand der Kategorie – bei Bedarf anpassen.
        </p>
      </div>

      <div className="mt-auto flex flex-col gap-2 pt-2">
        {showScanNext && (
          <Button
            variant="secondary"
            className="h-11"
            disabled={saving}
            onClick={() => handleSave("/scan")}
          >
            <Camera className="size-4" />
            Speichern & weiter scannen
          </Button>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="h-11 flex-1" onClick={() => leave()}>
            Abbrechen
          </Button>
          <Button className="h-11 flex-1" onClick={() => handleSave()} disabled={saving}>
            {saving ? "Speichern…" : "Speichern"}
          </Button>
        </div>

        {/* Vorher liess sich ein versehentlich angelegter Artikel nur ueber den
            Umweg "als aufgebraucht markieren, dann im Archiv loeschen"
            entfernen -- und verfaelschte dabei die Statistik. */}
        {itemId && (
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="ghost" className="h-11 text-destructive" disabled={deleting} />}
            >
              <Trash2 className="size-4" />
              Artikel löschen
            </AlertDialogTrigger>
            <AlertDialogPortal>
              <AlertDialogBackdrop />
              <AlertDialogPopup>
                <AlertDialogTitle>Artikel entfernen?</AlertDialogTitle>
                <AlertDialogDescription>
                  &quot;{name}&quot; verschwindet aus dem Vorrat und taucht auch nicht im Archiv
                  auf. Die App merkt sich weiterhin, in welche Kategorie dieser Artikel gehört.
                </AlertDialogDescription>
                <AlertDialogActions>
                  <AlertDialogClose render={<Button variant="outline" />}>
                    Abbrechen
                  </AlertDialogClose>
                  <AlertDialogClose
                    render={<Button variant="destructive" />}
                    onClick={handleDelete}
                  >
                    Löschen
                  </AlertDialogClose>
                </AlertDialogActions>
              </AlertDialogPopup>
            </AlertDialogPortal>
          </AlertDialog>
        )}
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
