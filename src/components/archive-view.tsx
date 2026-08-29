"use client";

import { useState } from "react";
import { ArchiveStats } from "@/components/archive-stats";
import { ArchiveList } from "@/components/archive-list";
import type { Category, Item } from "@/db/schema";

/**
 * Hält die Archivliste an einer Stelle, damit Statistik und Liste denselben
 * Stand zeigen.
 *
 * Vorher hatte die Liste ihre eigene Kopie: wer einen Eintrag entfernte, sah
 * ihn zwar sofort verschwinden, die Quote darüber blieb aber bis zum nächsten
 * Seitenaufbau auf dem alten Stand -- und widersprach damit der Liste
 * direkt darunter.
 */
export function ArchiveView({
  initialItems,
  categories,
}: {
  initialItems: Item[];
  categories: Pick<Category, "key" | "label">[];
}) {
  const [items, setItems] = useState(initialItems);
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);

  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }

  return (
    <div className="flex flex-1 flex-col gap-4.5 px-5">
      {/* Auf einem leeren Archiv haette die Statistik nichts zu sagen: eine
          Quote ohne Zahlen und acht leere Balken sind weniger als nichts. */}
      {items.length > 0 && <ArchiveStats items={items} />}
      <ArchiveList items={items} setItems={setItems} categories={categories} />
    </div>
  );
}
