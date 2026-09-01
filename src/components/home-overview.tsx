"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Award,
  CalendarCheck,
  ChevronRight,
  Flame,
  Leaf,
  Package,
  Sprout,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { ItemRow } from "@/components/item-row";
import { SectionLabel } from "@/components/section-label";
import { EmptyState } from "@/components/empty-state";
import { AddItemButton } from "@/components/add-action-sheet";
import { ListSwitcher } from "@/components/list-switcher";
import { InstallHintBanner } from "@/components/install-hint";
import { ReminderHintBanner } from "@/components/reminder-hint";
import { useIsClient } from "@/lib/use-is-client";
import {
  computeArchiveStats,
  computeBadges,
  computeSavings,
  type Badge,
  type BadgeId,
  type CategoryEstimate,
  type ResolvedEntry,
} from "@/lib/stats";
import { EXPIRY_BUCKETS, URGENT_WITHIN_DAYS, daysUntil } from "@/lib/expiry";
import { cn } from "@/lib/utils";
import {
  resolveItem,
  resolveVerb,
  undoResolve,
  type ResolveStatus,
} from "@/lib/item-actions";
import type { Category, Item, List, Place } from "@/db/schema";

/**
 * Die Eimer der Vorschau: dieselbe Gliederung wie im Vorrat, nur ohne
 * "Später". Die Startseite beantwortet die Frage "was ist jetzt dran?" --
 * was in drei Wochen abläuft, gehört in den Vorrat, nicht auf die Startseite.
 */
const PREVIEW_BUCKETS = EXPIRY_BUCKETS.filter((bucket) => bucket.title !== "Später");

/**
 * Wie viele Zeilen die Vorschau insgesamt und je Abschnitt zeigt.
 *
 * Die Zeilen werden reihum vergeben und nicht der Reihe nach: bei achtundzwanzig
 * abgelaufenen Artikeln fräße ein reines "von oben auffüllen" das ganze Budget
 * und "Heute" käme gar nicht mehr vor -- genau der Fehler, den die alte
 * Zweiteilung in "Abgelaufen" und "Als Nächstes dran" umgangen hatte. Vier
 * gefüllte Eimer bekommen so je zwei Zeilen, zwei Eimer je drei.
 */
const PREVIEW_ROW_BUDGET = 8;
const PREVIEW_ROWS_PER_BUCKET = 3;

/**
 * Der Umfang des Fortschrittsrings: 2 · π · 50 = 314,16 bei r = 50.
 *
 * Als Konstante und nicht gerechnet, weil derselbe Wert einmal als Länge des
 * gefüllten Bogens und einmal als Länge der Lücke gebraucht wird -- die Lücke
 * muss mindestens so lang sein wie der Rest des Kreises, sonst fängt das
 * Muster von vorne an und der Ring ist bei 10 % voll.
 */
const RING_CIRCUMFERENCE = 314.16;

/** Ein Icon je Abzeichen. Die Zuordnung ist Darstellung und gehört nicht in stats.ts. */
const BADGE_ICONS: Record<BadgeId, LucideIcon> = {
  first_save: Sprout,
  streak_7: Flame,
  streak_30: Zap,
  monthly_goal: Target,
  saved_50: Award,
  waste_free_4_weeks: Leaf,
  saved_100: Trophy,
  one_year: CalendarCheck,
};

const euroFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});
const kiloFormat = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const badgeDateFormat = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Unter einem Kilo in Gramm.
 *
 * "0,3 kg CO₂ vermieden" liest sich wie eine Rundung auf null, "300 g" ist
 * dieselbe Zahl und klingt nach etwas. Die Grenze liegt bei 950 g, damit
 * nicht "950 g" und "1,0 kg" nebeneinander vorkommen.
 */
function formatCo2(grams: number): string {
  if (grams < 950) return `${grams} g`;
  return `${kiloFormat.format(grams / 1000)} kg`;
}

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
  monthlyGoal,
  lists,
  activeListId,
  userName,
}: {
  initialItems: Item[];
  /**
   * Neben Schlüssel und Beschriftung die beiden Schätzwerte: aus ihnen
   * entstehen die Ersparnis-Zahlen der Hero-Karte.
   */
  categories: Pick<Category, "key" | "label" | "avgPriceCents" | "avgCo2Grams">[];
  places: Pick<Place, "id" | "name">[];
  /** Nur Status, Menge, Kategorie und Zeitpunkt -- mehr braucht die Quote nicht. */
  resolvedEntries: ResolvedEntry[];
  /** Prozentziel des Nutzers für den laufenden Monat. */
  monthlyGoal: number;
  lists: (Pick<List, "id" | "name"> & {
    itemCount: number;
    memberCount: number;
  })[];
  activeListId: number;
  userName: string;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [prevInitialItems, setPrevInitialItems] = useState(initialItems);
  const [badgesOpen, setBadgesOpen] = useState(false);

  if (initialItems !== prevInitialItems) {
    setPrevInitialItems(initialItems);
    setItems(initialItems);
  }

  // Alles Datumsabhaengige erst im Client: new Date() im Server-Render bricht
  // den Prerender der Route ab (siehe useIsClient).
  const isClient = useIsClient();
  const today = useMemo(() => (isClient ? new Date() : null), [isClient]);

  const placeNames = useMemo(
    () => new Map(places.map((p) => [p.id, p.name])),
    [places],
  );
  const categoryLabels = useMemo(
    () => new Map(categories.map((c) => [c.key, c.label])),
    [categories],
  );
  const estimates = useMemo(
    () =>
      new Map<string, CategoryEstimate>(
        categories.map((c) => [
          c.key,
          { priceCents: c.avgPriceCents, co2Grams: c.avgCo2Grams },
        ]),
      ),
    [categories],
  );

  const buckets = useMemo(() => {
    if (!today) return null;
    const withDays = items.map((item) => ({
      item,
      days: daysUntil(item.expiryDate, today),
    }));
    const expired = withDays.filter((entry) => entry.days < 0);
    const soon = withDays.filter(
      (entry) => entry.days >= 0 && entry.days <= URGENT_WITHIN_DAYS,
    );
    return {
      expired: expired.length,
      soon: soon.length,
      fresh: withDays.length - expired.length - soon.length,
      // Die Segmentleiste teilte bisher durch items.length, der Zähler
      // daneben zeigte die Summe der Mengen -- bei "3× Milch" behauptete die
      // Leiste damit ein anderes Verhältnis, als die Zahlen daneben sagten.
      // Beide zählen jetzt Zeilen, genau wie der Vorrat-Filter und die Zahl
      // im Listenwechsel (getListsWithCounts zählt ebenfalls Zeilen).
      total: withDays.length,
      // Innerhalb eines Eimers das Dringendste zuerst; bei Abgelaufenem ist
      // days negativ, dort steht das am längsten Überfällige oben.
      sections: PREVIEW_BUCKETS.map((bucket) => ({
        title: bucket.title,
        danger: bucket.danger,
        items: withDays
          .filter((entry) => bucket.test(entry.days))
          .sort((a, b) => a.days - b.days)
          .map((entry) => entry.item),
      })).filter((section) => section.items.length > 0),
    };
  }, [items, today]);

  /** Wie viele Zeilen jeder Abschnitt zeigen darf -- reihum vergeben. */
  const shownPerSection = useMemo(() => {
    const sections = buckets?.sections ?? [];
    const shown = sections.map(() => 0);
    let budget = PREVIEW_ROW_BUDGET;
    for (let round = 0; round < PREVIEW_ROWS_PER_BUCKET && budget > 0; round += 1) {
      for (let index = 0; index < sections.length && budget > 0; index += 1) {
        if (sections[index].items.length > shown[index]) {
          shown[index] += 1;
          budget -= 1;
        }
      }
    }
    return shown;
  }, [buckets]);

  const stats = useMemo(
    () => (today ? computeArchiveStats(resolvedEntries, today) : null),
    [resolvedEntries, today],
  );
  const savings = useMemo(
    () => (today ? computeSavings(resolvedEntries, today, estimates) : null),
    [resolvedEntries, today, estimates],
  );
  const badges = useMemo(
    () => (today ? computeBadges(resolvedEntries, today, monthlyGoal) : null),
    [resolvedEntries, today, monthlyGoal],
  );

  async function resolve(item: Item, nextStatus: ResolveStatus) {
    const previousItems = items;
    const remaining = item.quantity - 1;

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

  const dateLine = today
    ? new Intl.DateTimeFormat("de-DE", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(today)
    : "";

  /**
   * Der Link hinter einem Abschnitt.
   *
   * "Heute" und "Morgen" liegen vollständig innerhalb des Filters "Bald
   * fällig" (bis einschließlich URGENT_WITHIN_DAYS = 3 Tage), "Diese Woche"
   * reicht bis Tag 7 und damit darüber hinaus -- dort führt der Link auf den
   * ungefilterten Vorrat, statt die Hälfte der gemeinten Artikel wegzufiltern.
   */
  function sectionHref(title: string): string {
    if (title === "Abgelaufen") return "/inventory?filter=abgelaufen";
    if (title === "Diese Woche") return "/inventory";
    return "/inventory?filter=bald";
  }

  function row(item: Item) {
    return (
      <ItemRow
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
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 pt-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight">
            {today ? `${greetingFor(today.getHours())}, ${userName}` : userName}
          </h1>
          <p className="mt-1.5 h-4.5 text-[13px] font-medium text-muted-foreground">
            {dateLine}
          </p>
        </div>
        <ListSwitcher activeListId={activeListId} lists={lists} />
      </div>

      {/* Genau einer von beiden: auf iOS im Browser-Tab die Installation,
          sonst -- und nur solange es etwas einzuschalten gibt -- das
          Angebot der Erinnerungen. */}
      <InstallHintBanner />
      <ReminderHintBanner />

      {buckets && stats && savings && badges && (
        <div>
          <HeroCard
            quota={stats.quota}
            streakDays={stats.streakDays}
            savedThisMonth={stats.savedThisMonth}
            savings={savings}
            monthlyGoal={monthlyGoal}
            badges={badges}
            open={badgesOpen}
            onToggle={() => setBadgesOpen((prev) => !prev)}
          />
          {buckets.total > 0 && <SegmentBar buckets={buckets} />}
        </div>
      )}

      {buckets?.sections.map((section, index) => {
        const shown = shownPerSection[index];
        const hidden = section.items.length - shown;
        const href = sectionHref(section.title);
        return (
          <section key={section.title} className="flex flex-col gap-2.5">
            {/* Zähler und "Alle ansehen" bleiben, anders als im Entwurf: sie
                sind der einzige Weg von der Startseite in den gefilterten
                Vorrat. */}
            <SectionLabel
              title={section.title}
              tone={section.danger ? "danger" : "muted"}
              count={section.items.length}
              href={href}
            />
            {section.items.slice(0, shown).map(row)}
            {/* Ohne diese Zeile sieht ein Ausschnitt aus wie der ganze
                Rückstand. */}
            {hidden > 0 && (
              <Link
                href={href}
                className="flex items-center justify-center gap-1 py-1 text-[12.5px] font-semibold text-muted-foreground"
              >
                Noch {hidden} {hidden === 1 ? "weiteren" : "weitere"} ansehen
                <ChevronRight className="size-3.5" strokeWidth={2.2} />
              </Link>
            )}
          </section>
        );
      })}

      {items.length === 0 && (
        <div className="rounded-3xl border border-border bg-card">
          <EmptyState
            icon={Package}
            tone="muted"
            title="Dein Vorrat ist noch leer"
            body="Scanne den ersten Barcode oder trag etwas von Hand ein – danach übernimmt BetterFood."
            action={<AddItemButton label="Artikel hinzufügen" />}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Die Hero-Karte: was der Vorrat bisher gebracht hat, in einem Bild.
 *
 * Sie ersetzt die drei nebeneinander stehenden Zähler. Deren Zahlen sind
 * damit nicht verschwunden, sondern in die Segmentleiste darunter gewandert
 * -- sie beschreiben den Ist-Zustand des Vorrats und sind damit eine andere
 * Aussage als die Bilanz hier oben. Getrennt kann jede von beiden das zeigen,
 * was sie am besten kann: der Ring ein Verhältnis, die Leiste eine
 * Aufteilung.
 */
function HeroCard({
  quota,
  streakDays,
  savedThisMonth,
  savings,
  monthlyGoal,
  badges,
  open,
  onToggle,
}: {
  quota: number | null;
  streakDays: number;
  savedThisMonth: number;
  savings: { moneySavedCents: number; co2SavedGrams: number };
  monthlyGoal: number;
  badges: Badge[];
  open: boolean;
  onToggle: () => void;
}) {
  const earned = badges
    .filter((badge) => badge.earnedAt !== null)
    .sort((a, b) => b.earnedAt!.getTime() - a.earnedAt!.getTime());
  // Die drei zuletzt erreichten, in der Fußzeile von links nach rechts
  // aufsteigend nach Datum -- so steht das jüngste Abzeichen am nächsten am
  // Text daneben.
  const recent = earned.slice(0, 3).reverse();
  const hasSavings = savings.moneySavedCents > 0 || savings.co2SavedGrams > 0;
  const goalReached = quota !== null && quota >= monthlyGoal;

  return (
    <div className="rounded-[28px] border border-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-[18px]">
        <div className="relative size-29 shrink-0">
          {/* Farben als var() am SVG-Attribut statt als Tailwind-Klasse:
              stroke ist hier kein Rand, sondern die Linie selbst, und der
              Wert stammt aus derselben Token-Tabelle wie jede Klasse. */}
          <svg viewBox="0 0 116 116" className="size-full -rotate-90" aria-hidden="true">
            <circle
              cx="58"
              cy="58"
              r="50"
              fill="none"
              stroke="var(--track-ring)"
              strokeWidth="11"
            />
            {quota !== null && quota > 0 && (
              <circle
                cx="58"
                cy="58"
                r="50"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="11"
                strokeLinecap="round"
                strokeDasharray={`${(quota / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[24px] leading-none font-extrabold tabular-nums">
              {quota === null ? "–" : `${quota} %`}
            </span>
            <span className="mt-1 text-[10.5px] leading-none font-bold tracking-[0.06em] text-faint uppercase">
              gerettet
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="flex h-[30px] items-center gap-1 rounded-[10px] bg-primary-tint px-2.5 text-[14px] font-extrabold tabular-nums text-primary">
              <Leaf className="size-3.5" strokeWidth={2.4} />
              {streakDays}
            </span>
            {/* Umbrechend statt abgeschnitten: neben dem 116px-Ring bleiben
                in der 390px-Spalte rund 118px für dieses Label, und "Tage
                ohne Verschwendung" misst bei 12px/700 etwa 150px. Der
                Entwurf schreibt hier "Tage-Streak"; das ist kürzer, aber ein
                Anglizismus in einer sonst durchgehend deutschen Oberfläche --
                und das Archiv sagt an derselben Stelle schon seit #14 "N
                Wochen ohne Verschwendung". */}
            <span className="min-w-0 text-[12px] leading-tight font-bold text-muted-foreground">
              {streakDays === 1 ? "Tag ohne Verschwendung" : "Tage ohne Verschwendung"}
            </span>
          </div>

          {hasSavings ? (
            <div>
              <p className="text-[16px] leading-none font-extrabold tabular-nums">
                {euroFormat.format(savings.moneySavedCents / 100)} gespart
              </p>
              <p className="mt-0.5 text-[12px] font-semibold text-muted-foreground">
                {formatCo2(savings.co2SavedGrams)} CO₂ vermieden
              </p>
            </div>
          ) : savedThisMonth > 0 ? (
            // Gerettet wurde etwas, gerechnet werden kann es nur nicht: den
            // Kategorien fehlen die Schätzwerte. "0,00 € gespart" wäre hier
            // eine Behauptung über den Monat statt über die Datenlage.
            <Link href="/knowledge" className="text-[12px] font-semibold text-muted-foreground">
              <span className="font-bold text-primary">Schätzwerte ergänzen</span>, dann
              rechnet BetterFood Geld und CO₂ mit.
            </Link>
          ) : (
            <p className="text-[12px] font-semibold text-muted-foreground">
              Noch nichts abgehakt – deine Bilanz entsteht hier.
            </p>
          )}

          <div>
            <div className="flex items-baseline justify-between gap-2 text-[11px] font-bold">
              <span className="text-muted-foreground">Monatsziel {monthlyGoal} %</span>
              <span className={goalReached ? "text-primary" : "text-faint"}>
                {quota === null ? "–" : `${quota} %`}
              </span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-track"
              role="img"
              aria-label={`Monatsziel ${monthlyGoal} Prozent, erreicht ${quota ?? 0} Prozent`}
            >
              <span
                className="block h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, ((quota ?? 0) / monthlyGoal) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 border-t border-border pt-3.5">
        <div className="flex items-center gap-1.5">
          {(recent.length > 0 ? recent : badges.slice(0, 3)).map((badge) => (
            <BadgeCircle key={badge.id} badge={badge} earned={recent.length > 0} />
          ))}
        </div>
        <span className="min-w-0 flex-1 truncate text-[12px] font-bold text-faint">
          {earned.length === 0
            ? "Noch keine Abzeichen"
            : earned.length > 3
              ? `+${earned.length - 3} Abzeichen`
              : `${earned.length} von ${badges.length} Abzeichen`}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="shrink-0 text-[12.5px] font-bold text-primary"
        >
          {open ? "Zuklappen" : "Alle ansehen"}
        </button>
      </div>

      {open && (
        <ul className="mt-3.5 flex flex-col gap-2.5">
          {badges.map((badge) => (
            <li key={badge.id} className="flex items-center gap-2.5">
              <BadgeCircle
                badge={badge}
                earned={badge.earnedAt !== null}
                labelled={false}
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[13px] leading-tight font-bold",
                    badge.earnedAt === null && "text-faint",
                  )}
                >
                  {badge.label}
                </span>
                <span className="mt-0.5 block truncate text-[11.5px] leading-tight font-semibold text-faint">
                  {badge.earnedAt === null
                    ? badge.requirement
                    : `Erreicht am ${badgeDateFormat.format(badge.earnedAt)}`}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Ein Abzeichen als Kreis.
 *
 * rounded-full ist hier eine bewusste Ausnahme von der Hausregel, die Radien
 * im Band um --radius (14px) hält und die volle Rundung sonst nur Punkten,
 * Griffen und Schalter-Knöpfen zugesteht: ein Abzeichen ist eine Medaille,
 * und rund ist bei einer Medaille die Form der Sache und keine Dekoration.
 * Der Entwurf gibt border-radius: 99px vor; das ist die eine Stelle, an der
 * ihm gefolgt wird.
 */
function BadgeCircle({
  badge,
  earned,
  /**
   * In der aufgeklappten Übersicht steht der Name sichtbar daneben -- dort ist
   * der Kreis reine Dekoration und darf nicht ein zweites Mal vorgelesen
   * werden. In der Fußzeile steht er allein und trägt den Namen selbst.
   */
  labelled = true,
}: {
  badge: Badge;
  earned: boolean;
  labelled?: boolean;
}) {
  const Icon = BADGE_ICONS[badge.id];
  return (
    <span
      title={labelled ? badge.label : undefined}
      aria-hidden={labelled ? undefined : "true"}
      className={cn(
        "flex size-8.5 shrink-0 items-center justify-center rounded-full",
        earned ? "bg-primary-tint text-primary" : "bg-track text-faint",
      )}
    >
      <Icon className="size-4" strokeWidth={2.2} aria-hidden="true" />
      {labelled && <span className="sr-only">{badge.label}</span>}
    </span>
  );
}

/**
 * Die Aufteilung des Vorrats als 4px-Leiste mit Legende.
 *
 * Statt der bisherigen 8px-Leiste unter drei großen Zahlen: die Zahlen stehen
 * jetzt in der Legende selbst und bleiben Links in den gefilterten Vorrat.
 * Ein Balken, der ein Verhältnis zeigt, braucht keine Höhe -- er braucht nur
 * Länge.
 */
function SegmentBar({
  buckets,
}: {
  buckets: { fresh: number; soon: number; expired: number; total: number };
}) {
  return (
    <div className="mt-3.5">
      <div className="flex items-center justify-between gap-2 text-[12px] font-bold">
        <div className="flex items-center gap-3.5">
          <LegendEntry
            href="/inventory?filter=bald"
            dot="bg-warning"
            value={buckets.soon}
            label="bald"
          />
          <LegendEntry
            href="/inventory?filter=abgelaufen"
            dot="bg-danger"
            value={buckets.expired}
            label="abgelaufen"
          />
        </div>
        <Link href="/inventory" className="text-muted-foreground tabular-nums">
          {buckets.total} gesamt
        </Link>
      </div>
      <div
        className="mt-[7px] flex h-1 overflow-hidden rounded-full bg-track-2"
        role="img"
        aria-label={`${buckets.fresh} frisch, ${buckets.soon} bald fällig, ${buckets.expired} abgelaufen`}
      >
        <span
          className="bg-primary"
          style={{ width: `${share(buckets.fresh, buckets.total)}%` }}
        />
        <span
          className="bg-warning"
          style={{ width: `${share(buckets.soon, buckets.total)}%` }}
        />
        <span
          className="bg-danger"
          style={{ width: `${share(buckets.expired, buckets.total)}%` }}
        />
      </div>
    </div>
  );
}

function LegendEntry({
  href,
  dot,
  value,
  label,
}: {
  href: string;
  /** Tailwind-Klasse des Punktes -- als Tabelle, damit der Scanner sie findet. */
  dot: string;
  value: number;
  label: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-1.5 text-muted-foreground">
      <span className={cn("size-[7px] rounded-full", dot)} />
      <span className="tabular-nums">{value}</span> {label}
    </Link>
  );
}

function share(part: number, total: number) {
  return total === 0 ? 0 : (part / total) * 100;
}
