"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category, Item } from "@/db/schema";

function daysUntil(date: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function urgencyStyles(days: number) {
  if (days <= 1) return "border-l-4 border-l-destructive";
  if (days <= 3) return "border-l-4 border-l-yellow-500";
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

  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }

  const categoryLabels = Object.fromEntries(categories.map((c) => [c.key, c.label]));

  async function resolveItem(id: number, status: "used" | "thrown_away", name: string) {
    setPendingId(id);
    setItems((prev) => prev.filter((item) => item.id !== id));

    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast.success(
        status === "used" ? `${name} als aufgebraucht markiert` : `${name} entsorgt`,
      );
      router.refresh();
    } catch {
      toast.error("Konnte nicht aktualisiert werden.");
      setItems(initialItems);
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center text-muted-foreground">
        <p className="font-medium">Dein Vorrat ist leer.</p>
        <p className="text-sm">Scanne oder füge deinen ersten Artikel hinzu.</p>
      </div>
    );
  }

  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const group = groups.get(item.category);
    if (group) group.push(item);
    else groups.set(item.category, [item]);
  }

  const sections = Array.from(groups.entries()).sort(
    ([, a], [, b]) => daysUntil(a[0].expiryDate) - daysUntil(b[0].expiryDate),
  );

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {sections.map(([categoryKey, categoryItems]) => (
        <div key={categoryKey} className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {categoryLabels[categoryKey] ?? categoryKey}
          </h2>
          {categoryItems.map((item) => {
            const days = daysUntil(item.expiryDate);
            return (
              <Card
                key={item.id}
                className={cn(
                  "flex-row items-center justify-between gap-2 p-3",
                  urgencyStyles(days),
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {item.name}
                    {item.quantity > 1 && (
                      <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                        ×{item.quantity}
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{daysLabel(days)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Link href={`/edit/${item.id}`}>
                    <Button size="icon" variant="outline" aria-label="Bearbeiten">
                      <Pencil className="size-4" />
                    </Button>
                  </Link>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={pendingId === item.id}
                    onClick={() => resolveItem(item.id, "used", item.name)}
                    aria-label="Aufgebraucht"
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="outline"
                    disabled={pendingId === item.id}
                    onClick={() => resolveItem(item.id, "thrown_away", item.name)}
                    aria-label="Weggeworfen"
                  >
                    <Trash2 className="size-4" />
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
