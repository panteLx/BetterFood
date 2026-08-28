"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import type { Category, Item } from "@/db/schema";

function formatDate(date: Date | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    date,
  );
}

export function ArchiveList({
  initialItems,
  categories,
}: {
  initialItems: Item[];
  categories: Pick<Category, "key" | "label">[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [pendingId, setPendingId] = useState<number | null>(null);

  const categoryLabels = Object.fromEntries(categories.map((c) => [c.key, c.label]));

  async function restoreItem(id: number, name: string) {
    setPendingId(id);
    setItems((prev) => prev.filter((item) => item.id !== id));

    try {
      const res = await fetch(`/api/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) throw new Error();
      toast.success(`${name} wiederhergestellt`);
      router.refresh();
    } catch {
      toast.error("Konnte nicht wiederhergestellt werden.");
      setItems(initialItems);
    } finally {
      setPendingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center text-muted-foreground">
        <p className="font-medium">Das Archiv ist leer.</p>
        <p className="text-sm">Aufgebrauchte oder entsorgte Artikel erscheinen hier.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-4">
      {items.map((item) => (
        <Card key={item.id} className="flex-row items-center justify-between gap-2 p-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">
              {item.name}
              {item.quantity > 1 && (
                <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                  ×{item.quantity}
                </span>
              )}
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant="secondary">{categoryLabels[item.category] ?? item.category}</Badge>
              <Badge variant={item.status === "used" ? "default" : "outline"}>
                {item.status === "used" ? "Aufgebraucht" : "Weggeworfen"}
              </Badge>
              <span className="text-xs text-muted-foreground">{formatDate(item.resolvedAt)}</span>
            </div>
          </div>
          <Button
            size="icon"
            variant="outline"
            disabled={pendingId === item.id}
            onClick={() => restoreItem(item.id, item.name)}
            aria-label="Wiederherstellen"
          >
            <RotateCcw className="size-4" />
          </Button>
        </Card>
      ))}
    </div>
  );
}
