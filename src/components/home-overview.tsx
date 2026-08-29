"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, Check, Package } from "lucide-react";
import { ItemCard } from "@/components/item-card";
import { EmptyState } from "@/components/empty-state";
import { AddItemButton } from "@/components/add-action-sheet";
import { ListSwitcher } from "@/components/list-switcher";
import { InstallHintBanner } from "@/components/install-hint";
import { useIsClient } from "@/lib/use-is-client";
import { computeArchiveStats, type ResolvedEntry } from "@/lib/stats";
import { URGENT_WITHIN_DAYS, daysUntil } from "@/lib/expiry";
import {
  resolveItem,
  resolveVerb,
  undoResolve,
  type ResolveStatus,
} from "@/lib/item-actions";
import type { Category, Item, List, Place } from "@/db/schema";

// Mehr als das passt nicht auf den ersten Bildschirm, und die Startseite soll
// genau eine Frage beantworten: was muss ich als Naechstes aufbrauchen?
const URGENT_PREVIEW_COUNT = 4;

function greetingFor(hour: number): string {
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Hallo";
  return "Guten Abend";
}

export function HomeOverview({
  initialItems,
  categories,
  places,
  resolvedEntries,
  lists,
  activeListId,
  userName,
}: {
  initialItems: Item[];
  categories: Pick<Category, "key" | "label">[];
  places: Pick<Place, "id" | "name">[];
  /** Nur Status, Menge und Zeitpunkt -- mehr braucht die Quote nicht. */
  resolvedEntries: ResolvedEntry[];
  lists: (Pick<List, "id" | "name"> & { itemCount: number; memberCount: number })[];
  activeListId: number;
  userName: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);

  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }

  // Alles Datumsabhaengige erst im Client: new Date() im Server-Render bricht
  // den Prerender der Route ab (siehe useIsClient).
  const isClient = useIsClient();
  const today = useMemo(() => (isClient ? new Date() : null), [isClient]);

  const placeNames = useMemo(() => new Map(places.map((p) => [p.id, p.name])), [places]);
  const categoryLabels = useMemo(
    () => new Map(categories.map((c) => [c.key, c.label])),
    [categories],
  );

  const buckets = useMemo(() => {
    if (!today) return null;
    const withDays = items.map((item) => ({ item, days: daysUntil(item.expiryDate, today) }));
    const expired = withDays.filter((entry) => entry.days < 0);
    const soon = withDays.filter((entry) => entry.days >= 0 && entry.days <= URGENT_WITHIN_DAYS);
    return {
      expired,
      soon,
      fresh: withDays.length - expired.length - soon.length,
      total: items.reduce((sum, item) => sum + item.quantity, 0),
      urgent: [...expired, ...soon]
        .sort((a, b) => a.days - b.days)
        .slice(0, URGENT_PREVIEW_COUNT)
        .map((entry) => entry.item),
    };
  }, [items, today]);

  const stats = useMemo(
    () => (today ? computeArchiveStats(resolvedEntries, today) : null),
    [resolvedEntries, today],
  );

  async function resolve(item: Item, nextStatus: ResolveStatus) {
    const previousItems = items;
    const remaining = item.quantity - 1;

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

  const dateLine = today
    ? new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "long" }).format(
        today,
      )
    : "";

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 pt-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight">
            {today ? `${greetingFor(today.getHours())}, ${userName}` : userName}
          </h1>
          <p className="mt-1.5 h-4.5 text-[13px] font-medium text-muted-foreground">{dateLine}</p>
        </div>
        <ListSwitcher activeListId={activeListId} lists={lists} />
      </div>

      <InstallHintBanner />

      {buckets && (
        <div className="flex flex-col gap-3.5 rounded-3xl border border-border bg-card px-4 pt-4 pb-4.5 shadow-card">
          <div className="flex items-stretch">
            <Counter
              href="/inventory?filter=bald"
              value={buckets.soon.length}
              label="bald fällig"
              tone="text-warning"
            />
            <span className="w-px bg-border" />
            <Counter
              href="/inventory?filter=abgelaufen"
              value={buckets.expired.length}
              label="abgelaufen"
              tone="text-danger"
            />
            <span className="w-px bg-border" />
            <Counter href="/inventory" value={buckets.total} label="im Vorrat" />
          </div>

          {/* Der Balken macht das Verhaeltnis lesbar, das drei nebeneinander
              stehende Zahlen fuer sich nicht hergeben. */}
          <div
            className="flex h-2 overflow-hidden rounded-[5px] bg-surface-2"
            role="img"
            aria-label={`${buckets.fresh} frisch, ${buckets.soon.length} bald fällig, ${buckets.expired.length} abgelaufen`}
          >
            <span className="bg-primary" style={{ width: `${share(buckets.fresh, items.length)}%` }} />
            <span
              className="bg-warning"
              style={{ width: `${share(buckets.soon.length, items.length)}%` }}
            />
            <span
              className="bg-danger"
              style={{ width: `${share(buckets.expired.length, items.length)}%` }}
            />
          </div>

          <Link
            href="/archive"
            className="flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground"
          >
            {stats?.quota === null || stats === null ? (
              "Noch nichts abgehakt – deine Quote entsteht hier"
            ) : (
              <>
                <span className="font-extrabold text-primary">{stats.quota} %</span> diesen Monat
                gerettet
              </>
            )}
            <ChevronRight className="size-3.5" strokeWidth={2.2} />
          </Link>
        </div>
      )}

      {buckets && buckets.urgent.length > 0 && (
        <section className="flex flex-col gap-2.5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-bold">Bald aufbrauchen</h2>
            <Link href="/inventory?filter=bald" className="text-[13px] font-semibold text-primary">
              Alle ansehen
            </Link>
          </div>
          {buckets.urgent.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              meta={
                item.placeId !== null && placeNames.has(item.placeId)
                  ? placeNames.get(item.placeId)!
                  : (categoryLabels.get(item.category) ?? item.category)
              }
              onConsume={() => resolve(item, "used")}
              onDiscard={() => resolve(item, "thrown_away")}
            />
          ))}
        </section>
      )}

      {buckets && buckets.urgent.length === 0 && (
        <div className="rounded-3xl border border-border bg-card">
          <EmptyState
            icon={items.length === 0 ? Package : Check}
            tone={items.length === 0 ? "muted" : "primary"}
            title={items.length === 0 ? "Dein Vorrat ist noch leer" : "Nichts läuft bald ab"}
            body={
              items.length === 0
                ? "Scanne den ersten Barcode oder trag etwas von Hand ein – danach übernimmt BetterFood."
                : "Dein Vorrat sieht gut aus. Wir melden uns rechtzeitig."
            }
            action={items.length === 0 ? <AddItemButton label="Artikel hinzufügen" /> : undefined}
          />
        </div>
      )}
    </div>
  );
}

function share(part: number, total: number) {
  return total === 0 ? 0 : (part / total) * 100;
}

function Counter({
  href,
  value,
  label,
  tone,
}: {
  href: string;
  value: number;
  label: string;
  tone?: string;
}) {
  return (
    <Link href={href} className="flex flex-1 flex-col items-center gap-1.5">
      <span className={`text-[26px] leading-none font-extrabold tabular-nums ${tone ?? ""}`}>
        {value}
      </span>
      <span className="text-[11.5px] leading-tight font-semibold text-muted-foreground">
        {label}
      </span>
    </Link>
  );
}
