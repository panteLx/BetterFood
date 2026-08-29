"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Package, Search } from "lucide-react";
import { Chip, Segment } from "@/components/ui/chip";
import { ItemCard } from "@/components/item-card";
import { EmptyState } from "@/components/empty-state";
import {
  resolveItem,
  resolveVerb,
  undoResolve,
  type ResolveStatus,
} from "@/lib/item-actions";
import { URGENT_WITHIN_DAYS, daysUntil } from "@/lib/expiry";
import type { Category, Item, Place } from "@/db/schema";

type StatusFilter = "alle" | "bald" | "abgelaufen";
type Grouping = "ablauf" | "ort" | "kategorie";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "alle", label: "Alle" },
  { value: "bald", label: "Bald fällig" },
  { value: "abgelaufen", label: "Abgelaufen" },
];

const GROUPINGS: { value: Grouping; label: string }[] = [
  { value: "ablauf", label: "Ablauf" },
  { value: "ort", label: "Ort" },
  { value: "kategorie", label: "Kategorie" },
];

// Die Eimer der Ablauf-Gruppierung. "Diese Woche" endet bei 7 Tagen, weil
// darueber hinaus kein Einkauf mehr geplant wird.
const EXPIRY_BUCKETS = [
  { title: "Abgelaufen", danger: true, test: (days: number) => days < 0 },
  {
    title: "Bald aufbrauchen",
    danger: false,
    test: (days: number) => days >= 0 && days <= URGENT_WITHIN_DAYS,
  },
  {
    title: "Diese Woche",
    danger: false,
    test: (days: number) => days > URGENT_WITHIN_DAYS && days <= 7,
  },
  { title: "Später", danger: false, test: (days: number) => days > 7 },
] as const;

export function InventoryList({
  initialItems,
  categories,
  places,
  initialStatus = "alle",
}: {
  initialItems: Item[];
  categories: Pick<Category, "key" | "label">[];
  places: Pick<Place, "id" | "name">[];
  /** Vorbelegter Filter -- die Zaehler auf der Startseite verlinken direkt hierher. */
  initialStatus?: StatusFilter;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [grouping, setGrouping] = useState<Grouping>("ablauf");

  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }

  const categoryLabels = useMemo(
    () => new Map(categories.map((c) => [c.key, c.label])),
    [categories],
  );
  const placeNames = useMemo(() => new Map(places.map((p) => [p.id, p.name])), [places]);

  const labelOf = (item: Item) => categoryLabels.get(item.category) ?? item.category;
  const placeOf = (item: Item) =>
    item.placeId === null ? "Ohne Ort" : (placeNames.get(item.placeId) ?? "Ohne Ort");

  async function resolve(item: Item, nextStatus: ResolveStatus) {
    const previousItems = items;
    const remaining = item.quantity - 1;

    // Optimistisch: bei mehreren Einheiten bleibt der Artikel mit einer
    // Einheit weniger stehen, statt komplett zu verschwinden.
    setItems((prev) =>
      remaining > 0
        ? prev.map((i) => (i.id === item.id ? { ...i, quantity: remaining } : i))
        : prev.filter((i) => i.id !== item.id),
    );

    try {
      const undo = await resolveItem(item.id, nextStatus);
      const verb = resolveVerb(nextStatus);
      toast.success(
        remaining > 0 ? `1× ${item.name} ${verb} – noch ${remaining} übrig` : `${item.name} ${verb}`,
        {
          action: {
            label: "Rückgängig",
            onClick: async () => {
              setItems(previousItems);
              try {
                await undoResolve(undo, item.quantity);
                toast.success("Wiederhergestellt");
              } catch {
                toast.error("Rückgängig machen hat nicht geklappt.");
              }
              router.refresh();
            },
          },
        },
      );
      router.refresh();
    } catch {
      toast.error("Konnte nicht aktualisiert werden.");
      setItems(previousItems);
    }
  }

  const pool = useMemo(() => {
    const sorted = [...items].sort(
      (a, b) => daysUntil(a.expiryDate) - daysUntil(b.expiryDate),
    );
    const byStatus = sorted.filter((item) => {
      const days = daysUntil(item.expiryDate);
      if (status === "bald") return days >= 0 && days <= URGENT_WITHIN_DAYS;
      if (status === "abgelaufen") return days < 0;
      return true;
    });

    const needle = query.trim().toLowerCase();
    if (!needle) return byStatus;
    return byStatus.filter(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        labelOf(item).toLowerCase().includes(needle) ||
        placeOf(item).toLowerCase().includes(needle),
    );
    // labelOf/placeOf haengen nur an den beiden Maps, die hier bereits stehen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, status, query, categoryLabels, placeNames]);

  const sections = useMemo(() => {
    if (grouping === "ort") {
      const named = places.map((place) => ({
        title: place.name,
        danger: false,
        items: pool.filter((item) => item.placeId === place.id),
      }));
      // Artikel ohne Ort bekommen einen eigenen Abschnitt am Ende, statt
      // stillschweigend aus der Ansicht zu fallen.
      const unplaced = pool.filter(
        (item) => item.placeId === null || !placeNames.has(item.placeId),
      );
      return [...named, { title: "Ohne Ort", danger: false, items: unplaced }].filter(
        (section) => section.items.length > 0,
      );
    }

    if (grouping === "kategorie") {
      return categories
        .map((category) => ({
          title: category.label,
          danger: false,
          items: pool.filter((item) => item.category === category.key),
        }))
        .filter((section) => section.items.length > 0);
    }

    return EXPIRY_BUCKETS.map((bucket) => ({
      title: bucket.title,
      danger: bucket.danger,
      items: pool.filter((item) => bucket.test(daysUntil(item.expiryDate))),
    })).filter((section) => section.items.length > 0);
  }, [pool, grouping, places, categories, placeNames]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col px-5 pt-2">
        <Header total={0} shown={0} />
        <EmptyState
          className="mt-8"
          icon={Package}
          title="Dein Vorrat ist noch leer"
          body="Scanne den ersten Barcode oder trag etwas von Hand ein – danach übernimmt BetterFood."
          action={{ href: "/scan", label: "Ersten Artikel hinzufügen" }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3.5 pt-2">
      <div className="px-5">
        <Header total={items.length} shown={pool.length} />
      </div>

      <div className="px-5">
        <label className="flex h-12 items-center gap-2.5 rounded-2xl border border-border bg-card px-3.5">
          <Search className="size-4.5 shrink-0 text-faint" />
          <input
            type="search"
            inputMode="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Artikel, Ort oder Kategorie suchen"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] font-semibold outline-none placeholder:text-faint"
          />
        </label>
      </div>

      <div className="flex gap-1 px-5">
        {STATUS_FILTERS.map((filter) => (
          <Segment
            key={filter.value}
            active={status === filter.value}
            onClick={() => setStatus(filter.value)}
          >
            {filter.label}
          </Segment>
        ))}
      </div>

      <div className="flex items-center gap-2 px-5">
        <span className="text-[11.5px] font-semibold whitespace-nowrap text-faint">Gruppiert</span>
        {GROUPINGS.map((group) => (
          <Chip
            key={group.value}
            active={grouping === group.value}
            onClick={() => setGrouping(group.value)}
            className="h-7.5 px-2.5 text-xs"
          >
            {group.label}
          </Chip>
        ))}
      </div>

      <div className="flex flex-col gap-4.5 px-5 pb-4">
        {sections.map((section) => (
          <section key={section.title} className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between">
              <h2
                className={`pl-1 text-[13px] font-bold ${section.danger ? "text-danger" : "text-muted-foreground"}`}
              >
                {section.title}
              </h2>
              <span className="text-[11.5px] font-semibold text-faint">
                {section.items.length} {section.items.length === 1 ? "Artikel" : "Artikel"}
              </span>
            </div>
            {section.items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                meta={grouping === "ort" ? labelOf(item) : placeOf(item)}
                onConsume={() => resolve(item, "used")}
                onDiscard={() => resolve(item, "thrown_away")}
              />
            ))}
          </section>
        ))}

        {sections.length === 0 && (
          <EmptyState
            icon={Search}
            title={query.trim() ? "Nichts gefunden" : "Hier ist gerade nichts"}
            body={
              query.trim()
                ? `Kein Artikel passt zu „${query.trim()}“.`
                : "Kein Artikel passt zu diesem Filter."
            }
          />
        )}
      </div>
    </div>
  );
}

function Header({ total, shown }: { total: number; shown: number }) {
  return (
    <div>
      <h1 className="text-[26px] leading-tight">Dein Vorrat</h1>
      <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
        {total === 0 ? (
          "Noch nichts erfasst"
        ) : (
          <>
            {shown} von {total} Artikeln ·{" "}
            <Link href="/archive" className="font-semibold text-primary">
              Archiv
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
