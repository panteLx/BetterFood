"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Package, Search } from "lucide-react";
import { Chip, Segment } from "@/components/ui/chip";
import { ItemRow } from "@/components/item-row";
import { SectionLabel } from "@/components/section-label";
import { EmptyState } from "@/components/empty-state";
import { AddItemButton } from "@/components/add-action-sheet";
import { ListSwitcher } from "@/components/list-switcher";
import {
  resolveItem,
  resolveVerb,
  undoResolve,
  type ResolveStatus,
} from "@/lib/item-actions";
import {
  EXPIRY_BUCKETS,
  URGENT_WITHIN_DAYS,
  daysUntil,
  type StatusFilter,
} from "@/lib/expiry";
import { useIsClient } from "@/lib/use-is-client";
import type { Category, Item, List, Place } from "@/db/schema";

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

export function InventoryList({
  initialItems,
  categories,
  places,
  initialStatus = "alle",
  lists,
  activeListId,
}: {
  initialItems: Item[];
  categories: Pick<Category, "key" | "label">[];
  places: Pick<Place, "id" | "name">[];
  /** Vorbelegter Filter -- die Zaehler auf der Startseite verlinken direkt hierher. */
  initialStatus?: StatusFilter;
  lists: ListWithCounts[];
  activeListId: number;
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

  // Alles Datumsabhängige erst im Client. Bis hierher rechnete diese Datei
  // new Date() mitten im Memo, also auch im Server-Render -- unter
  // cacheComponents:true ist das ein "unstable value", der den Prerender der
  // Route abbricht, und selbst wo die Route ohnehin dynamisch ist, rechnet
  // der Server mit seiner Zeitzone und der Browser mit seiner: ein Artikel um
  // 23:30 Uhr MESZ war serverseitig schon "morgen". Die Startseite macht es
  // seit jeher so; hier zieht die Liste nur nach.
  const isClient = useIsClient();
  const today = useMemo(() => (isClient ? new Date() : null), [isClient]);

  const categoryLabels = useMemo(
    () => new Map(categories.map((c) => [c.key, c.label])),
    [categories],
  );
  const placeNames = useMemo(
    () => new Map(places.map((p) => [p.id, p.name])),
    [places],
  );

  const labelOf = (item: Item) =>
    categoryLabels.get(item.category) ?? item.category;
  const placeOf = (item: Item) =>
    item.placeId === null
      ? "Ohne Ort"
      : (placeNames.get(item.placeId) ?? "Ohne Ort");

  async function resolve(item: Item, nextStatus: ResolveStatus) {
    const previousItems = items;
    const remaining = item.quantity - 1;

    // Optimistisch: bei mehreren Einheiten bleibt der Artikel mit einer
    // Einheit weniger stehen, statt komplett zu verschwinden.
    setItems((prev) =>
      remaining > 0
        ? prev.map((i) =>
            i.id === item.id ? { ...i, quantity: remaining } : i,
          )
        : prev.filter((i) => i.id !== item.id),
    );

    try {
      const undo = await resolveItem(item.id, nextStatus);
      const verb = resolveVerb(nextStatus);
      toast.success(
        remaining > 0
          ? `1× ${item.name} ${verb} – noch ${remaining} übrig`
          : `${item.name} ${verb}`,
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

  // Die Restlaufzeit einmal je Artikel statt in jedem Durchgang neu:
  // sortieren, filtern und gruppieren fragten vorher dieselbe Rechnung
  // sechsmal ab (einmal je Eimer), und mit den feineren Eimern aus
  // expiry.ts wären es jetzt sieben.
  //
  // Eigenes Memo und nicht zusammen mit den Filtern: die Suche hängt an jedem
  // Tastendruck, die Restlaufzeit und die Sortierung nicht. Zusammen lief bei
  // 263 Artikeln je getipptem Buchstaben ein voller Sortierlauf, der immer
  // dieselbe Reihenfolge herausgab.
  //
  // null, solange der heutige Tag noch nicht feststeht -- siehe today.
  const withDays = useMemo(() => {
    if (!today) return null;
    return items
      .map((item) => ({ item, days: daysUntil(item.expiryDate, today) }))
      .sort((a, b) => a.days - b.days);
  }, [items, today]);

  const pool = useMemo(() => {
    if (!withDays) return null;

    const byStatus = withDays.filter(({ days }) => {
      if (status === "bald") return days >= 0 && days <= URGENT_WITHIN_DAYS;
      if (status === "abgelaufen") return days < 0;
      return true;
    });

    const needle = query.trim().toLowerCase();
    if (!needle) return byStatus;
    return byStatus.filter(
      ({ item }) =>
        item.name.toLowerCase().includes(needle) ||
        labelOf(item).toLowerCase().includes(needle) ||
        placeOf(item).toLowerCase().includes(needle),
    );
    // labelOf/placeOf haengen nur an den beiden Maps, die hier bereits stehen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withDays, status, query, categoryLabels, placeNames]);

  /**
   * Die Abschnitte der aktuellen Gliederung.
   *
   * Ein Durchlauf durch `pool` je Gliederung statt eines filter() je
   * Abschnitt: bei zwölf Kategorien und 263 Artikeln waren das über dreitausend
   * Vergleiche für eine Einteilung, die jeder Artikel selbst kennt. Die
   * Reihenfolge der Abschnitte kommt weiterhin aus der jeweiligen Tabelle
   * (Fächer, Kategorien, EXPIRY_BUCKETS) und nicht aus der Fundfolge, und
   * leere Abschnitte fallen wie bisher weg.
   */
  const sections = useMemo(() => {
    if (!pool) return null;

    // Der Schlüssel je Artikel und die Abschnitte in ihrer festen Reihenfolge
    // -- beides hängt an der Gliederung.
    const keyOf = (entry: { item: Item; days: number }): string | number => {
      if (grouping === "ort") {
        return entry.item.placeId !== null && placeNames.has(entry.item.placeId)
          ? entry.item.placeId
          : "__unplaced";
      }
      if (grouping === "kategorie") return entry.item.category;
      // EXPIRY_BUCKETS kommt aus expiry.ts, seit Startseite und Vorrat
      // dieselbe Gliederung zeigen. Die Tabelle ist dabei feiner geworden:
      // aus "Bald aufbrauchen" (0 bis 3 Tage) sind "Heute" und "Morgen"
      // geworden. Genau in diesen beiden Tagen entscheidet sich, ob etwas
      // weggeworfen wird -- sie in einen Eimer mit "in drei Tagen" zu werfen,
      // verschenkte die Dringlichkeit.
      return EXPIRY_BUCKETS.find((bucket) => bucket.test(entry.days))!.title;
    };

    const order: { key: string | number; title: string; danger: boolean }[] =
      grouping === "ort"
        ? [
            ...places.map((place) => ({
              key: place.id as string | number,
              title: place.name,
              danger: false,
            })),
            // Artikel ohne Ort bekommen einen eigenen Abschnitt am Ende,
            // statt stillschweigend aus der Ansicht zu fallen.
            { key: "__unplaced", title: "Ohne Ort", danger: false },
          ]
        : grouping === "kategorie"
          ? categories.map((category) => ({
              key: category.key as string | number,
              title: category.label,
              danger: false,
            }))
          : EXPIRY_BUCKETS.map((bucket) => ({
              key: bucket.title as string | number,
              title: bucket.title,
              danger: bucket.danger,
            }));

    const grouped = new Map<string | number, { item: Item; days: number }[]>();
    for (const entry of pool) {
      const key = keyOf(entry);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(entry);
      else grouped.set(key, [entry]);
    }

    return order
      .map(({ key, title, danger }) => ({
        title,
        danger,
        entries: grouped.get(key) ?? [],
      }))
      .filter((section) => section.entries.length > 0);
  }, [pool, grouping, places, categories, placeNames]);

  if (items.length === 0) {
    return (
      <div className="flex flex-1 flex-col px-5 pt-2">
        <Header total={0} shown={0} lists={lists} activeListId={activeListId} />
        <EmptyState
          className="mt-8"
          icon={Package}
          title="Dein Vorrat ist noch leer"
          body="Scanne den ersten Barcode oder trag etwas von Hand ein – danach übernimmt BetterFood."
          action={<AddItemButton label="Ersten Artikel hinzufügen" />}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3.5 pt-2">
      <div className="px-5">
        <Header
          total={items.length}
          shown={pool?.length ?? null}
          lists={lists}
          activeListId={activeListId}
        />
      </div>

      <div className="px-5">
        <label className="flex h-12 items-center gap-2.5 rounded-lg border border-border bg-card px-3.5">
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
        <span className="text-[11.5px] font-semibold whitespace-nowrap text-faint">
          Gruppiert
        </span>
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
        {/* Bis die Hydration den heutigen Tag liefert, steht die Gliederung
            noch nicht fest (siehe today). Statt einer Lücke stehen dort
            Platzhalter in Zeilenhöhe -- höchstens sechs, weil darunter der
            Bildschirm ohnehin zu Ende ist und ein Vorrat mit 263 Artikeln
            sonst 263 pulsierende Balken aufbaut, die eine Lidschlagdauer
            später wieder verschwinden. */}
        {sections === null && (
          <div className="flex flex-col gap-2.5">
            {Array.from({ length: Math.min(items.length, 6) }).map(
              (_, index) => (
                <div
                  key={index}
                  className="h-15 animate-pulse rounded-[15px] bg-muted"
                />
              ),
            )}
          </div>
        )}

        {sections?.map((section) => (
          <section key={section.title} className="flex flex-col gap-2.5">
            <SectionLabel
              title={section.title}
              tone={section.danger ? "danger" : "muted"}
              count={section.entries.length}
            />
            {section.entries.map(({ item, days }) => (
              <ItemRow
                key={item.id}
                item={item}
                days={days}
                // Die Zweitzeile trägt jeweils die andere Achse als die
                // Gruppierung: wer nach Ort gliedert, hat den Ort schon in der
                // Überschrift und will darunter die Kategorie sehen -- und
                // umgekehrt. Sonst stünde in jeder Zeile dasselbe Wort.
                meta={grouping === "ort" ? labelOf(item) : placeOf(item)}
                onConsume={() => resolve(item, "used")}
                onDiscard={() => resolve(item, "thrown_away")}
              />
            ))}
          </section>
        ))}

        {sections?.length === 0 && (
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

type ListWithCounts = Pick<List, "id" | "name"> & {
  itemCount: number;
  memberCount: number;
};

// Der Listenwechsel steht hier wie auf der Startseite rechts neben der
// Ueberschrift: der Vorrat IST der Inhalt einer Liste, und wer ihn ansieht,
// ist genau der, der die Liste wechseln will -- ihn dafuer erst auf die
// Startseite zu schicken, war ein Umweg ohne Grund. Er gehoert auch in den
// leeren Zustand: eine Liste kann leer sein, waehrend die andere voll ist,
// und dann ist der Wechsel die einzige sinnvolle Handlung auf der Seite.
function Header({
  total,
  shown,
  lists,
  activeListId,
}: {
  total: number;
  /** null, solange Filter und Gliederung noch nicht gerechnet sind. */
  shown: number | null;
  lists: ListWithCounts[];
  activeListId: number;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight">Dein Vorrat</h1>
        <p className="mt-1.5 text-[13px] font-medium text-muted-foreground">
          {/* Ohne gerechneten Filter nur die Gesamtzahl: "12 von 12" wäre in
              genau dem Moment gelogen, in dem über die Zähler der Startseite
              mit "abgelaufen" vorgefiltert hereinkommt. */}
          {total === 0
            ? "Noch nichts erfasst"
            : shown === null
              ? `${total} Artikel`
              : `${shown} von ${total} Artikeln`}
        </p>
      </div>
      <ListSwitcher activeListId={activeListId} lists={lists} />
    </div>
  );
}
