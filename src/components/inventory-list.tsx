"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Camera, Check, ClipboardList, Hash, Plus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category, Item } from "@/db/schema";

// Ab hier gilt ein Artikel als dringend und wird kategorieuebergreifend nach
// ganz oben gezogen -- die Frage beim Oeffnen der App ist "was muss ich heute
// aufbrauchen?", nicht "was habe ich an Milchprodukten?".
const URGENT_WITHIN_DAYS = 3;

type UndoInfo = { itemId: number; archiveId: number | null };

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyStyles(days: number) {
  if (days <= 1) return "border-l-4 border-l-destructive";
  if (days <= URGENT_WITHIN_DAYS) return "border-l-4 border-l-yellow-500";
  return "border-l-4 border-l-green-600";
}

function daysLabel(days: number): string {
  if (days < 0) return `Seit ${Math.abs(days)} Tag(en) abgelaufen`;
  if (days === 0) return "Läuft heute ab";
  if (days === 1) return "Läuft morgen ab";
  return `Noch ${days} Tage`;
}

export function InventoryList({
  initialItems,
  categories,
}: {
  initialItems: Item[];
  categories: Pick<Category, "key" | "label">[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }

  const categoryLabels = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.key, c.label])),
    [categories],
  );

  async function undoResolve(undo: UndoInfo, previousItems: Item[]) {
    setItems(previousItems);
    try {
      if (undo.archiveId !== null) {
        // Teil-Verbrauch: die Archiv-Zeile wieder entfernen und die Menge des
        // aktiven Artikels zurueckdrehen.
        const item = previousItems.find((i) => i.id === undo.itemId);
        const del = await fetch(`/api/items/${undo.archiveId}`, { method: "DELETE" });
        if (!del.ok) throw new Error();
        const res = await fetch(`/api/items/${undo.itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: item?.quantity ?? 1 }),
        });
        if (!res.ok) throw new Error();
      } else {
        const res = await fetch(`/api/items/${undo.itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "active" }),
        });
        if (!res.ok) throw new Error();
      }
      toast.success("Wieder hergestellt");
      router.refresh();
    } catch {
      toast.error("Rückgängig machen hat nicht geklappt.");
      router.refresh();
    }
  }

  /**
   * Nachgekauft: bisher musste dafuer der komplette Erfassungsweg noch einmal
   * durchlaufen werden (scannen oder tippen), obwohl der Artikel schon in der
   * Liste steht und quantity genau dafuer da ist.
   */
  async function addOne(item: Item) {
    const previousItems = items;
    const next = item.quantity + 1;

    setPendingId(item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: next } : i)));

    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity: next }),
      });
      if (!res.ok) throw new Error();

      toast.success(`${item.name} – jetzt ${next}× im Vorrat`, {
        action: {
          label: "Rückgängig",
          onClick: () => undoAddOne(item.id, item.quantity, previousItems),
        },
      });
      router.refresh();
    } catch {
      toast.error("Konnte nicht aktualisiert werden.");
      setItems(previousItems);
    } finally {
      setPendingId(null);
    }
  }

  async function undoAddOne(itemId: number, quantity: number, previousItems: Item[]) {
    setItems(previousItems);
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast.error("Rückgängig machen hat nicht geklappt.");
      router.refresh();
    }
  }

  async function resolveItem(item: Item, status: "used" | "thrown_away") {
    const previousItems = items;
    const remaining = item.quantity - 1;

    setPendingId(item.id);
    // Optimistisch: bei mehreren Einheiten bleibt der Artikel mit einer
    // Einheit weniger stehen, statt komplett zu verschwinden.
    setItems((prev) =>
      remaining > 0
        ? prev.map((i) => (i.id === item.id ? { ...i, quantity: remaining } : i))
        : prev.filter((i) => i.id !== item.id),
    );

    try {
      const res = await fetch(`/api/items/${item.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      const { undo } = (await res.json()) as { undo: UndoInfo };

      const verb = status === "used" ? "aufgebraucht" : "entsorgt";
      toast.success(
        remaining > 0
          ? `1× ${item.name} ${verb} – noch ${remaining} übrig`
          : `${item.name} ${verb}`,
        {
          action: {
            label: "Rückgängig",
            onClick: () => undoResolve(undo, previousItems),
          },
        },
      );
      router.refresh();
    } catch {
      toast.error("Konnte nicht aktualisiert werden.");
      setItems(previousItems);
    } finally {
      setPendingId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (categoryLabels[item.category] ?? item.category).toLowerCase().includes(q),
    );
  }, [items, query, categoryLabels]);

  const sections = useMemo(() => {
    const urgent: Item[] = [];
    const rest: Item[] = [];
    for (const item of filtered) {
      if (daysUntil(item.expiryDate) <= URGENT_WITHIN_DAYS) urgent.push(item);
      else rest.push(item);
    }
    urgent.sort((a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate));

    const groups = new Map<string, Item[]>();
    for (const item of rest) {
      const group = groups.get(item.category);
      if (group) group.push(item);
      else groups.set(item.category, [item]);
    }

    const categorySections = Array.from(groups.entries())
      .sort(([, a], [, b]) => daysUntil(a[0].expiryDate) - daysUntil(b[0].expiryDate))
      .map(([key, groupItems]) => ({
        id: key,
        title: categoryLabels[key] ?? key,
        urgent: false,
        items: groupItems,
      }));

    return urgent.length > 0
      ? [{ id: "__urgent__", title: "Bald aufbrauchen", urgent: true, items: urgent }, ...categorySections]
      : categorySections;
  }, [filtered, categoryLabels]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex flex-col gap-1 text-muted-foreground">
          <p className="font-medium text-foreground">Dein Vorrat ist leer.</p>
          <p className="text-sm">Scanne den Barcode oder trage den ersten Artikel von Hand ein.</p>
        </div>
        {/* Vorher stand hier nur Text -- die eigentliche Aktion lag im FAB, den
            der Nutzer auf dem allerersten Screen erst finden musste. */}
        <div className="flex w-full max-w-64 flex-col gap-2">
          <Link href="/scan" className="w-full">
            <Button size="lg" className="w-full">
              <Camera className="size-4" />
              Barcode scannen
            </Button>
          </Link>
          {/* Dritter Weg wie im Hinzufuegen-Sheet: eine unlesbare oder
              fehlende Kamera darf hier nicht in eine Sackgasse fuehren. */}
          <Link href="/scan-ean" className="w-full">
            <Button size="lg" variant="outline" className="w-full">
              <Hash className="size-4" />
              EAN eingeben
            </Button>
          </Link>
          <Link href="/add" className="w-full">
            <Button size="lg" variant="outline" className="w-full">
              <ClipboardList className="size-4" />
              Manuell eintragen
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      {/* Suche erst ab einer Menge, ab der Scrollen wirklich nervt. */}
      {items.length >= 8 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            inputMode="search"
            placeholder="Artikel oder Kategorie suchen"
            className="h-11 pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {sections.length === 0 && (
        <p className="p-8 text-center text-sm text-muted-foreground">
          Nichts gefunden für „{query.trim()}“.
        </p>
      )}

      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-2">
          <h2
            className={cn(
              "text-sm font-semibold",
              section.urgent ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {section.title}
          </h2>
          {section.items.map((item) => {
            const days = daysUntil(item.expiryDate);
            return (
              <Card
                key={item.id}
                className={cn(
                  "flex-row items-center gap-2 p-2 pl-3",
                  urgencyStyles(days),
                )}
              >
                {/* Die ganze Zeile fuehrt zum Bearbeiten -- das ersetzt den
                    dritten kleinen Icon-Button und schafft Platz fuer zwei
                    Trefferflaechen in voller Groesse. */}
                <Link href={`/edit/${item.id}`} className="min-w-0 flex-1 py-1.5">
                  <p className="truncate font-medium">
                    {item.name}
                    {item.quantity > 1 && (
                      <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                        ×{item.quantity}
                      </span>
                    )}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <p className="text-xs text-muted-foreground">{daysLabel(days)}</p>
                    {/* In der Dringlichkeitssektion stehen Artikel aus
                        verschiedenen Kategorien nebeneinander -- ohne Badge
                        waere nicht erkennbar, woher sie kommen. */}
                    {section.urgent && (
                      <Badge variant="secondary" className="max-w-full truncate">
                        {categoryLabels[item.category] ?? item.category}
                      </Badge>
                    )}
                  </div>
                </Link>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="icon-touch"
                    variant="outline"
                    disabled={pendingId === item.id}
                    onClick={() => addOne(item)}
                    aria-label={`Eine weitere Einheit ${item.name} hinzufügen`}
                  >
                    <Plus className="size-5" />
                  </Button>
                  <Button
                    size="icon-touch"
                    variant="outline"
                    disabled={pendingId === item.id}
                    onClick={() => resolveItem(item, "used")}
                    aria-label={
                      item.quantity > 1 ? `Eine Einheit aufgebraucht` : "Aufgebraucht"
                    }
                  >
                    <Check className="size-5" />
                  </Button>
                  <Button
                    size="icon-touch"
                    variant="outline"
                    disabled={pendingId === item.id}
                    onClick={() => resolveItem(item, "thrown_away")}
                    aria-label={item.quantity > 1 ? "Eine Einheit weggeworfen" : "Weggeworfen"}
                  >
                    <Trash2 className="size-5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ))}
    </div>
  );
}
