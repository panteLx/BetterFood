"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check, Trash2 } from "lucide-react";
import { CATEGORY_LABELS } from "@/lib/categories";
import { cn } from "@/lib/utils";
import type { Item } from "@/db/schema";

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

export function InventoryList({ initialItems }: { initialItems: Item[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<number | null>(null);

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

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      {items.map((item) => {
        const days = daysUntil(item.expiryDate);
        return (
          <Card
            key={item.id}
            className={cn("flex-row items-center justify-between gap-2 p-3", urgencyStyles(days))}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{item.name}</p>
              <div className="mt-1 flex items-center gap-2">
                <Badge variant="secondary">{CATEGORY_LABELS[item.category] ?? item.category}</Badge>
                <span className="text-xs text-muted-foreground">{daysLabel(days)}</span>
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
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
  );
}
