"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Award,
  CalendarCheck,
  ChevronRight,
  Flame,
  Sprout,
  Target,
  Trophy,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Avo, moodForBuckets, type AvoMood } from "@/components/avo";
import { ItemRow } from "@/components/item-row";
import { SectionLabel, toneForFilter } from "@/components/section-label";
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
  summarizeArchive,
  type Badge,
  type BadgeId,
  type CategoryEstimate,
  type ResolvedEntry,
} from "@/lib/stats";
import {
  EXPIRY_BUCKETS,
  URGENT_WITHIN_DAYS,
  daysUntil,
  formatShort,
  inventoryHref,
  type StatusFilter,
} from "@/lib/expiry";
import { CO2_FACTOR, PRICE_FACTOR } from "@/lib/estimates";
import { cn } from "@/lib/utils";
import {
  resolveItem,
  resolveToast,
  resolveVerb,
  undoResolveWithToast,
  type ResolveStatus,
} from "@/lib/item-actions";
import type { Category, Item, List, Place } from "@/db/schema";

/**
 * Die dringenden Eimer der Vorschau: dieselbe Gliederung wie im Vorrat, nur
 * ohne "Später". Sie beantworten die Frage "was ist jetzt dran?" und haben
 * deshalb den ersten Zugriff auf das Zeilenbudget.
 *
 * "Später" steht bewusst daneben und nicht dazwischen (LATER_BUCKET): der
 * Eimer füllt nur auf, was die dringenden übrig lassen. Vorher fiel er ganz
 * weg -- wer nichts hatte, das in den nächsten sieben Tagen abläuft, sah
 * unter der Frischling-Karte gar nichts mehr. Eine Startseite, die leer ist,
 * weil alles in Ordnung ist, sieht nicht ruhig aus, sondern kaputt.
 */
const PREVIEW_BUCKETS = EXPIRY_BUCKETS.filter((bucket) => bucket.title !== "Später");

/**
 * Der Auffüll-Eimer, aus derselben Tabelle geholt statt hier neu definiert --
 * Titel und Grenze (ab Tag 8) dürfen sich nicht von denen im Vorrat
 * unterscheiden. Das "!" ist sicher, solange EXPIRY_BUCKETS diesen Eintrag
 * hat; fiele er dort weg, wäre das ein Fehler im Vorrat und nicht hier.
 */
const LATER_BUCKET = EXPIRY_BUCKETS.find((bucket) => bucket.title === "Später")!;

/**
 * Wie viele Zeilen die Vorschau insgesamt und je dringendem Abschnitt zeigt.
 *
 * Die dringenden Zeilen werden reihum vergeben und nicht der Reihe nach: bei
 * achtundzwanzig abgelaufenen Artikeln fräße ein reines "von oben auffüllen"
 * das ganze Budget und "Heute" käme gar nicht mehr vor -- genau der Fehler,
 * den die alte Zweiteilung in "Abgelaufen" und "Als Nächstes dran" umgangen
 * hatte. Vier gefüllte Eimer bekommen so je zwei Zeilen, zwei Eimer je drei.
 *
 * Erst was danach vom Budget übrig ist, geht an "Später" -- ohne eigenen
 * Deckel, weil es nur ein Abschnitt ist und er nichts weiter verdrängen
 * kann. Bei leerem Vorderfeld sind das alle acht Zeilen, bei zwei dringenden
 * Artikeln noch sechs; belegen die dringenden Eimer alle acht, verschwindet
 * "Später" ganz.
 */
const PREVIEW_ROW_BUDGET = 8;
const PREVIEW_ROWS_PER_BUCKET = 3;

/**
 * Ein fertiger Abschnitt der Vorschau: der Eimer plus die Zeilenzahl, die er
 * vom Budget bekommen hat.
 *
 * `title` bleibt der Gruppierungs- und Verlinkungsschlüssel aus
 * EXPIRY_BUCKETS -- er wird nicht angezeigt und darf nicht umbenannt werden
 * (siehe der Kommentar an `filter` in expiry.ts). `label` ist die getrennte
 * Anzeigebezeichnung ("Schon drüber" statt "Abgelaufen"), die eine
 * Textänderung nicht mehr stillschweigend an den Links vorbeischleust.
 *
 * Der Titel wird ausdrücklich über alle Eimer typisiert. TypeScript leitet
 * aus dem filter() oben seit 5.5 ein Typprädikat ab, PREVIEW_BUCKETS kennt
 * "Später" also gar nicht mehr -- ohne diese Annotation ließe sich der
 * Auffüll-Abschnitt nicht an dieselbe Liste anhängen.
 */
type PreviewSection = {
  title: (typeof EXPIRY_BUCKETS)[number]["title"];
  /**
   * Anzeigetext -- ungleich `title`, siehe die Warnung an `SectionLabel`.
   * "Schon drüber" statt "Abgelaufen", "Heute dran" statt "Heute".
   */
  label: (typeof EXPIRY_BUCKETS)[number]["label"];
  /**
   * Der Vorrat-Filter des Eimers -- siehe EXPIRY_BUCKETS in expiry.ts. Trägt
   * seit dem Frischling-Umbau auch die Farbrolle der Überschrift
   * (`toneForFilter` leitet "abgelaufen" -> danger, "bald" -> warning, `null`
   * -> primary daraus ab), ein eigenes `danger`-Feld ist damit überflüssig.
   */
  filter: StatusFilter | null;
  entries: { item: Item; days: number }[];
  shown: number;
};

/**
 * Der Umfang des Fortschrittsrings: 2 · π · 50 = 314,16 bei r = 50.
 *
 * Als Konstante und nicht gerechnet, weil derselbe Wert einmal als Länge des
 * gefüllten Bogens und einmal als Länge der Lücke gebraucht wird -- die Lücke
 * muss mindestens so lang sein wie der Rest des Kreises, sonst fängt das
 * Muster von vorne an und der Ring ist bei 10 % voll.
 *
 * Die bf-ring-Keyframe in globals.css läuft von genau diesem Wert auf 0 --
 * sie liest ihn als --ring-circumference vom Element, damit ein anderer
 * Radius die Animation nicht lautlos halbiert.
 */
const RING_CIRCUMFERENCE = 314.16;

/**
 * Die Staerke des Rings, in Einheiten der 116er viewBox -- auf den 78px, in
 * denen er steht, also knapp 6,7px.
 *
 * Vorher 13 (8,7px): der Ring war damit so breit, dass innen kaum Platz fuer
 * die Zahl blieb, und "100 %" stiess fast an seine Innenkante. Duenner liest
 * sich das Verhaeltnis genauso deutlich und die Karte wirkt ruhiger.
 */
const RING_STROKE = 10;

/** Feste ID, weil die Karte genau einmal auf der Seite steht. */
const RING_GRADIENT_ID = "frischling-ring-gradient";

/** Ein Icon je Abzeichen. Die Zuordnung ist Darstellung und gehört nicht in stats.ts. */
const BADGE_ICONS: Record<BadgeId, LucideIcon> = {
  first_save: Sprout,
  streak_7: Flame,
  streak_30: Zap,
  monthly_goal: Target,
  saved_50: Award,
  saved_100: Trophy,
  one_year: CalendarCheck,
};

/**
 * Die drei Tönungen des Abzeichen-Fußes, der Reihe nach vergeben.
 *
 * Der Entwurf zeigt dort genau drei bunte Kreise (primary-tint / warning-tint
 * / badge-tint) statt einer einzelnen Akzentfarbe -- die Fläche kodiert dort
 * keinen Abzeichen-Typ, sondern sorgt nur für Abwechslung in der Reihe. Nicht
 * erreichte Abzeichen bleiben unabhängig davon in der neutralen Fläche, sonst
 * behauptete Farbe einen Fortschritt, den es nicht gibt.
 */
const BADGE_FOOTER_TINTS = [
  { bg: "bg-primary-tint", text: "text-primary-deep" },
  { bg: "bg-warning-tint", text: "text-warning-ink" },
  { bg: "bg-badge-tint", text: "text-badge-ink" },
] as const;

const euroFormat = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
});
const kiloFormat = new Intl.NumberFormat("de-DE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
// Wie die anderen Formatter im Modulkopf und nicht im Render: ein
// Intl.DateTimeFormat ist das teuerste Objekt in diesem Renderpfad.
const dayFormat = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "2-digit",
  month: "long",
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
  return `${kiloFormat.format(grams / CO2_FACTOR)} kg`;
}

function greetingFor(hour: number): string {
  if (hour < 11) return "Guten Morgen";
  if (hour < 18) return "Hallo";
  return "Guten Abend";
}

/**
 * Deutsche Zahlwörter für die Sprechblase ("Zwei Sachen sind drüber.").
 *
 * Nur bis zehn ausgeschrieben -- darüber liest sich "Dreizehn Sachen" nicht
 * flüssiger als "13 Sachen", und ein Vorrat mit mehr als zehn gleichzeitig
 * dringenden Artikeln ist ohnehin der seltene Fall.
 */
const COUNT_WORDS = [
  "Eine",
  "Zwei",
  "Drei",
  "Vier",
  "Fünf",
  "Sechs",
  "Sieben",
  "Acht",
  "Neun",
  "Zehn",
];
function countWord(n: number): string {
  // Index ab 1: die Tabelle beginnt bei "Eine", eine Null-Zeile waere
  // unerreichbar (beide Aufrufer stehen hinter einem `> 0`-Zweig).
  return n >= 1 && n <= 10 ? COUNT_WORDS[n - 1] : String(n);
}

/**
 * Die Sprechblase der Frischling-Karte, nach Stimmung.
 *
 * Die Stimmung entscheidet den Satz, nicht der Text die Stimmung -- deshalb
 * hier und nicht als weiterer Zustand. `mood` kommt aus `moodForBuckets` und
 * kann laut Typ auch "cheer" sein, das tritt auf dieser Seite aber nie ein:
 * cheer ist eine Eigenschaft von Toast, /saved und Archiv, nicht der
 * Startseite -- der letzte Zweig deckt diesen Fall trotzdem sauber ab.
 */
function speechBubble(
  mood: AvoMood,
  buckets: { expired: number; soon: number },
): { line1: string; line2: string } {
  if (mood === "overdue") {
    const n = buckets.expired;
    return {
      // Nur das Verb verzweigt -- das Zahlwort fuer 1 steht in COUNT_WORDS
      // und nicht ein zweites Mal hier.
      line1: `${countWord(n)} ${n === 1 ? "Sache ist" : "Sachen sind"} drüber.`,
      line2: "Kriegen wir noch hin!",
    };
  }
  if (mood === "soon") {
    const n = buckets.soon;
    return {
      line1: "Heute ist was dran.",
      line2: `${countWord(n)} ${n === 1 ? "Sache will" : "Sachen wollen"} aufgebraucht werden.`,
    };
  }
  return { line1: "Alles frisch.", line2: "Nichts läuft in den nächsten Tagen ab." };
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
   * entstehen die Ersparnis-Zahlen der Frischling-Karte.
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

    // Ein Durchlauf statt eines filter() je Eimer: die Eimer sind über `days`
    // disjunkt, also ordnet der erste passende Test jeden Artikel endgültig
    // zu. Vorher lief die Liste fünfmal durch (vier dringende Eimer plus
    // "Später"), und jeder Lauf fragte dieselbe Zahl noch einmal ab.
    const byBucket = new Map<string, { item: Item; days: number }[]>(
      EXPIRY_BUCKETS.map((bucket) => [bucket.title, []]),
    );
    let expired = 0;
    let soon = 0;
    for (const entry of withDays) {
      const bucket = EXPIRY_BUCKETS.find((candidate) => candidate.test(entry.days));
      if (bucket) byBucket.get(bucket.title)!.push(entry);
      if (entry.days < 0) expired += 1;
      else if (entry.days <= URGENT_WITHIN_DAYS) soon += 1;
    }
    // Innerhalb eines Eimers das Dringendste zuerst; bei Abgelaufenem ist
    // days negativ, dort steht das am längsten Überfällige oben.
    for (const entries of byBucket.values()) entries.sort((a, b) => a.days - b.days);

    return {
      expired,
      soon,
      fresh: withDays.length - expired - soon,
      // Die Segmentkacheln teilten bisher durch items.length, der Zähler
      // daneben zeigte die Summe der Mengen -- bei "3× Milch" behauptete die
      // Kachel damit ein anderes Verhältnis, als die Zahl daneben sagte.
      // Beide zählen jetzt Zeilen, genau wie der Vorrat-Filter und die Zahl
      // im Listenwechsel (getListsWithCounts zählt ebenfalls Zeilen).
      total: withDays.length,
      urgentSections: PREVIEW_BUCKETS.map((bucket) => ({
        title: bucket.title,
        label: bucket.label,
        filter: bucket.filter,
        entries: byBucket.get(bucket.title)!,
      })).filter((section) => section.entries.length > 0),
      // Auch hier das Nächstliegende zuerst: "Später" ist keine Restekiste,
      // sondern der Anfang dessen, was als Nächstes dran wäre.
      later: byBucket.get(LATER_BUCKET.title)!,
    };
  }, [items, today]);

  /**
   * Die Abschnitte der Vorschau samt der Zeilenzahl, die jeder zeigen darf.
   *
   * Zwei Stufen: erst bekommen die dringenden Eimer reihum ihre Zeilen (höchstens
   * PREVIEW_ROWS_PER_BUCKET je Eimer), dann geht der Rest des Budgets an
   * "Später". Ein Abschnitt ohne zugeteilte Zeile fällt am Ende ganz weg --
   * eine Überschrift mit null Zeilen darunter wäre schlimmer als gar kein
   * Abschnitt. Bei PREVIEW_ROW_BUDGET = 8 und höchstens vier dringenden
   * Eimern kann das heute nur "Später" treffen; die Prüfung steht trotzdem
   * für alle da, damit ein kleineres Budget nicht stillschweigend eine
   * leere Überschrift erzeugt.
   */
  const sections = useMemo(() => {
    const urgent = buckets?.urgentSections ?? [];
    const shown = urgent.map(() => 0);
    let budget = PREVIEW_ROW_BUDGET;
    for (let round = 0; round < PREVIEW_ROWS_PER_BUCKET && budget > 0; round += 1) {
      for (let index = 0; index < urgent.length && budget > 0; index += 1) {
        if (urgent[index].entries.length > shown[index]) {
          shown[index] += 1;
          budget -= 1;
        }
      }
    }
    const result: PreviewSection[] = urgent.map((section, index) => ({
      ...section,
      shown: shown[index],
    }));
    const later = buckets?.later ?? [];
    if (budget > 0 && later.length > 0) {
      result.push({
        title: LATER_BUCKET.title,
        label: LATER_BUCKET.label,
        filter: LATER_BUCKET.filter,
        entries: later,
        shown: Math.min(budget, later.length),
      });
    }
    return result.filter((section) => section.shown > 0);
  }, [buckets]);

  // Ein Durchlauf durch das Archiv, zwei Auswertungen daraus: Quote/Serien
  // und Abzeichen stellten bis hierher dieselben Fragen an dieselbe Liste.
  const summary = useMemo(
    () => (today ? summarizeArchive(resolvedEntries, today) : null),
    [resolvedEntries, today],
  );
  const stats = useMemo(
    () => (summary ? computeArchiveStats(summary) : null),
    [summary],
  );
  const badges = useMemo(
    () => (summary ? computeBadges(summary, monthlyGoal) : null),
    [summary, monthlyGoal],
  );
  const savings = useMemo(
    () => (today ? computeSavings(resolvedEntries, today, estimates) : null),
    [resolvedEntries, today, estimates],
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
      // Die Serie ist hier schon berechnet (stats.streakDays, siehe oben) --
      // kein zusaetzlicher Durchlauf durchs Archiv nur fuer den Toast. Nur
      // beim Aufbrauchen angehaengt: ein weggeworfener Artikel bricht die
      // Serie eher, als sie zu feiern. In inventory-list.tsx und
      // item-detail.tsx fehlt genau dieser lokale Wert -- dort muesste er
      // erst aus der Seite herein gereicht werden, und das gehoert nicht zum
      // Toast-Inhalt dieser Einheit.
      const streakSuffix =
        nextStatus === "used" && stats && stats.streakDays > 0
          ? ` · Serie steht bei ${stats.streakDays} 🔥`
          : "";
      resolveToast({
        itemName: item.name,
        verb,
        remaining,
        extra: streakSuffix,
        onUndo: async () => {
          setItems(previousItems);
          await undoResolveWithToast(undo, item.quantity);
          router.refresh();
        },
      });
      router.refresh();
    } catch {
      toast.error("Konnte nicht aktualisiert werden.");
      setItems(previousItems);
    }
  }

  const dateLine = today ? dayFormat.format(today) : "";

  function row({ item, days }: { item: Item; days: number }, restless = false) {
    return (
      <ItemRow
        key={item.id}
        item={item}
        days={days}
        meta={
          item.placeId !== null && placeNames.has(item.placeId)
            ? placeNames.get(item.placeId)!
            : (categoryLabels.get(item.category) ?? item.category)
        }
        onConsume={() => resolve(item, "used")}
        onDiscard={() => resolve(item, "thrown_away")}
        restless={restless}
      />
    );
  }

  return (
    // pt-1.5 und nicht die 34px des Entwurfs: das Layout setzt die Safe Area
    // oben bereits als pt-[max(env(safe-area-inset-top),1.75rem)] (im Browser
    // also 28px), und beides zusammen ergab 62px Luft ueber der Begruessung --
    // sichtbar mehr als jede andere Seite. 6px darauf treffen die 34px, ohne
    // den Abstand ein zweites Mal zu setzen.
    <div className="flex flex-1 flex-col gap-5 px-[18px] pt-1.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[28px] leading-[1.15] tracking-[-0.01em]">
            {today ? `${greetingFor(today.getHours())}, ${userName}` : userName}
          </h1>
          <p className="mt-[5px] h-4.5 text-[13px] font-semibold text-muted-foreground">
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
          <FrischlingCard
            mood={moodForBuckets(buckets)}
            bucketCounts={buckets}
            quota={stats.quota}
            streakDays={stats.streakDays}
            savedThisMonth={stats.savedThisMonth}
            savings={savings}
            monthlyGoal={monthlyGoal}
            badges={badges}
            open={badgesOpen}
            onToggle={() => setBadgesOpen((prev) => !prev)}
          />
          {buckets.total > 0 && <SegmentTiles buckets={buckets} />}
        </div>
      )}

      {sections.map((section) => {
        const hidden = section.entries.length - section.shown;
        const href = inventoryHref(section.filter);
        return (
          <section key={section.title} className="flex flex-col">
            {/* Zähler und "Alle ansehen" bleiben, anders als im Entwurf: sie
                sind der einzige Weg von der Startseite in den gefilterten
                Vorrat. */}
            <SectionLabel
              title={section.label}
              tone={toneForFilter(section.filter)}
              count={section.entries.length}
              href={href}
            />
            <div className="mt-[11px] flex flex-col gap-[9px]">
              {section.entries
                .slice(0, section.shown)
                // Nur die oberste Zeile des Abgelaufen-Abschnitts wackelt --
                // siehe die Doku an ItemRows `restless`-Prop.
                .map((entry, index) => row(entry, section.title === "Abgelaufen" && index === 0))}
            </div>
            {/* Ohne diese Zeile sieht ein Ausschnitt aus wie der ganze
                Rückstand. */}
            {hidden > 0 && (
              <Link
                href={href}
                className="mt-[9px] flex items-center justify-center gap-1 py-1 font-heading text-[13px] font-bold text-muted-foreground"
              >
                Noch {hidden} {hidden === 1 ? "weiteren" : "weitere"} ansehen
                <ChevronRight className="size-3.5" strokeWidth={2.6} />
              </Link>
            )}
          </section>
        );
      })}

      {items.length === 0 && (
        /* Avo statt des grauen Paket-Quadrats -- dieselbe Begruendung wie im
           leeren Vorrat (siehe EmptyState): der erste Bildschirm ohne einen
           einzigen Datenpunkt ist die falsche Stelle fuer ein graues Symbol.
           Die Beschriftung nennt seitdem auch hier den ersten Artikel, weil
           es auf einem leeren Vorrat genau darum geht. */
        <EmptyState
          icon="mascot"
          variant="card"
          title="Hier ist noch nichts drin"
          body="Scanne den ersten Barcode oder trag etwas von Hand ein – danach übernehme ich."
          action={<AddItemButton label="Ersten Artikel hinzufügen" />}
        />
      )}
    </div>
  );
}

/**
 * Die Frischling-Karte: was der Vorrat bisher gebracht hat, in einem Bild --
 * mit Avo als Begleiter statt einer reinen Zahlenkarte.
 *
 * Sie ersetzt die bisherige Hero-Karte. Deren Zahlen sind damit nicht
 * verschwunden, sondern die Aufteilung frisch/bald/drüber wandert in die drei
 * Segmentkacheln darunter -- sie beschreiben den Ist-Zustand des Vorrats und
 * sind damit eine andere Aussage als die Bilanz hier oben. Getrennt kann
 * jede von beiden das zeigen, was sie am besten kann: der Ring ein
 * Verhältnis, die Kacheln eine Aufteilung.
 */
function FrischlingCard({
  mood,
  bucketCounts,
  quota,
  streakDays,
  savedThisMonth,
  savings,
  monthlyGoal,
  badges,
  open,
  onToggle,
}: {
  mood: AvoMood;
  bucketCounts: { expired: number; soon: number };
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
  // Die drei zuletzt erreichten, im Fuß von links nach rechts aufsteigend
  // nach Datum -- so steht das jüngste Abzeichen am nächsten am Text daneben.
  const recent = earned.slice(0, 3).reverse();
  const hasSavings = savings.moneySavedCents > 0 || savings.co2SavedGrams > 0;
  const goalReached = quota !== null && quota >= monthlyGoal;
  const bubble = speechBubble(mood, bucketCounts);

  return (
    <div className="relative overflow-hidden rounded-[30px] bg-card px-4 py-3.5 shadow-card">
      {/* Dekoration: ein blasser Kreis in der oberen Ecke und zwei
          aufsteigende Bläschen -- beide aria-hidden, weil sie nichts
          aussagen, was nicht ohnehin im Text steht. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-[52px] -right-[38px] size-[150px] rounded-full bg-primary-tint opacity-[.45]"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[22px] bottom-[26px] size-[9px] animate-bubble rounded-full bg-primary-inv"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[46px] bottom-[18px] size-[7px] animate-bubble rounded-full bg-primary-inv [animation-delay:1.4s]"
      />

      <div className="relative flex items-center gap-[11px]">
        <Avo size="md" mood={mood} animation="bob" className="[animation-duration:3.8s]" />
        <p className="min-w-0 flex-1 text-pretty font-heading text-[15px] leading-[1.3] font-bold">
          {bubble.line1}
          <span className="mt-0.5 block font-sans text-[12px] font-semibold text-muted-foreground">
            {bubble.line2}
          </span>
        </p>
        <div className="relative size-[78px] shrink-0">
          {/* Farben als var() am SVG-Attribut statt als Tailwind-Klasse:
              stroke ist hier kein Rand, sondern die Linie selbst, und der
              Wert stammt aus derselben Token-Tabelle wie jede Klasse.

              Gedreht wird die Gruppe und nicht das <svg>: der Bogen muss oben
              anfangen, der Verlauf darin aber weiter von links oben nach
              rechts unten laufen wie ueberall sonst in der App. Eine Drehung
              am <svg> haette ihn mitgedreht. */}
          <svg viewBox="0 0 116 116" className="size-full" aria-hidden="true">
            <defs>
              {/* Dieselben zwei Anteile wie --gradient-primary; als Token und
                  nicht als Hexwert, damit der Dunkelmodus mitkommt. Ein
                  Verlauf laesst sich einer SVG-Linie nur ueber eine solche
                  Definition zuweisen, `stroke` nimmt keine CSS-Verlaeufe. */}
              <linearGradient id={RING_GRADIENT_ID} x1="0.15" y1="0" x2="0.85" y2="1">
                <stop offset="0%" stopColor="var(--primary-light)" />
                <stop offset="100%" stopColor="var(--primary)" />
              </linearGradient>
            </defs>
            <g transform="rotate(-90 58 58)">
              <circle
                cx="58"
                cy="58"
                r="50"
                fill="none"
                stroke="var(--track-ring)"
                strokeWidth={RING_STROKE}
              />
              {quota !== null && quota > 0 && (
                <circle
                  cx="58"
                  cy="58"
                  r="50"
                  fill="none"
                  stroke={`url(#${RING_GRADIENT_ID})`}
                  strokeWidth={RING_STROKE}
                  // Bei einem vollen Ring stossen die beiden runden Enden
                  // aufeinander und stehen als sichtbare Kerbe an der
                  // Zwoelf-Uhr-Stelle -- genau bei 100 %, wo der Ring am
                  // besten aussehen sollte. Stumpf endet er dort nahtlos.
                  strokeLinecap={quota >= 100 ? "butt" : "round"}
                  strokeDasharray={`${(quota / 100) * RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
                  className="animate-ring"
                  style={{ "--ring-circumference": RING_CIRCUMFERENCE } as CSSProperties}
                />
              )}
            </g>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {/* Das Prozentzeichen eine Stufe kleiner und zurueckgenommen: bei
                dreistelligen Quoten stand "100 %" sonst fast an der Innenkante
                des Rings, und die Zahl ist ohnehin die Aussage. */}
            <span className="flex items-baseline gap-[2px] font-heading leading-none font-bold tabular-nums">
              <span className="text-[22px]">{quota === null ? "–" : quota}</span>
              {quota !== null && (
                <span className="text-[12px] text-muted-foreground">%</span>
              )}
            </span>
            <span className="mt-[3px] text-[10px] leading-none font-bold text-faint">
              gerettet
            </span>
          </div>
        </div>
      </div>

      <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
        <span className="flex h-[30px] shrink-0 items-center gap-1 rounded-full bg-warning-tint px-2.5 font-heading text-[14.5px] font-bold tabular-nums text-warning-ink">
          <span
            aria-hidden="true"
            className="inline-block animate-wobble text-[13px] [animation-duration:1.9s]"
          >
            🔥
          </span>
          {streakDays}
        </span>
        {hasSavings && (
          <>
            <span className="flex h-[30px] items-center rounded-full bg-surface-2 px-2.75 font-heading text-[14px] font-bold whitespace-nowrap">
              {euroFormat.format(savings.moneySavedCents / PRICE_FACTOR)}
            </span>
            <span className="flex h-[30px] items-center rounded-full bg-surface-2 px-2.75 font-heading text-[14px] font-bold whitespace-nowrap">
              {formatCo2(savings.co2SavedGrams)} CO₂
            </span>
          </>
        )}
      </div>
      {!hasSavings &&
        (savedThisMonth > 0 ? (
          // Gerettet wurde etwas, gerechnet werden kann es nur nicht: den
          // Kategorien fehlen die Schätzwerte. "0,00 € gespart" wäre hier
          // eine Behauptung über den Monat statt über die Datenlage.
          <Link
            href="/knowledge"
            className="relative mt-1.5 block text-[12px] font-semibold text-muted-foreground"
          >
            <span className="font-bold text-primary-deep">Schätzwerte ergänzen</span>, dann
            rechnet BetterFood Geld und CO₂ mit.
          </Link>
        ) : (
          <p className="relative mt-1.5 text-[12px] font-semibold text-muted-foreground">
            Noch nichts abgehakt – deine Bilanz entsteht hier.
          </p>
        ))}

      <div className="relative mt-3 flex items-center gap-[9px]">
        <div
          className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-track"
          role="img"
          aria-label={`Monatsziel ${monthlyGoal} Prozent, erreicht ${quota ?? 0} Prozent`}
        >
          <span
            className="block h-full rounded-full bg-(image:--gradient-primary) animate-grow-h [animation-delay:.2s]"
            style={{ width: `${Math.min(100, ((quota ?? 0) / monthlyGoal) * 100)}%` }}
          />
        </div>
        {goalReached && (
          <span className="shrink-0 text-[11px] font-bold text-primary-deep">
            Monatsziel {monthlyGoal} % ✓
          </span>
        )}
      </div>

      <div className="relative mt-3 flex items-center gap-2 border-t border-hairline pt-[11px]">
        <div className="flex items-center gap-1.5">
          {(recent.length > 0 ? recent : badges.slice(0, 3)).map((badge, index) => (
            <BadgeCircle
              key={badge.id}
              badge={badge}
              earned={recent.length > 0}
              tone={BADGE_FOOTER_TINTS[index]}
            />
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
          className="shrink-0 font-heading text-[13px] font-bold text-primary-deep"
        >
          {open ? "zuklappen" : "alle"}
        </button>
      </div>

      {open && (
        <ul className="relative mt-3.5 flex flex-col gap-2.5">
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
                    : `Erreicht am ${formatShort(badge.earnedAt)}`}
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
 * im Band um --radius (20px) hält und die volle Rundung sonst nur Punkten,
 * Griffen und Schalter-Knöpfen zugesteht: ein Abzeichen ist eine Medaille,
 * und rund ist bei einer Medaille die Form der Sache und keine Dekoration.
 */
function BadgeCircle({
  badge,
  earned,
  /**
   * In der aufgeklappten Übersicht steht der Name sichtbar daneben -- dort ist
   * der Kreis reine Dekoration und darf nicht ein zweites Mal vorgelesen
   * werden. Im Fuß der Karte steht er allein und trägt den Namen selbst.
   */
  labelled = true,
  /**
   * Die Fläche aus BADGE_FOOTER_TINTS -- nur im Fuß der Karte gesetzt, wo bis
   * zu drei erreichte Abzeichen nebeneinander stehen und Abwechslung
   * brauchen. Nicht erreichte Abzeichen ignorieren das und bleiben neutral.
   * Der Eintrag selbst statt eines Index: die Tabelle bleibt damit die
   * Sache des Aufrufers, und hier steht keine Modulo-Rechnung, die nur
   * einen Fall abdeckt, den es nicht gibt.
   */
  tone,
}: {
  badge: Badge;
  earned: boolean;
  labelled?: boolean;
  tone?: (typeof BADGE_FOOTER_TINTS)[number];
}) {
  const Icon = BADGE_ICONS[badge.id];
  return (
    <span
      title={labelled ? badge.label : undefined}
      aria-hidden={labelled ? undefined : "true"}
      className={cn(
        "flex size-8.5 shrink-0 items-center justify-center rounded-full",
        earned
          ? tone
            ? cn(tone.bg, tone.text)
            : "bg-primary-tint text-primary-deep"
          : "bg-track text-faint",
      )}
    >
      <Icon className="size-4" strokeWidth={2.2} aria-hidden="true" />
      {labelled && <span className="sr-only">{badge.label}</span>}
    </span>
  );
}

/**
 * Die Aufteilung des Vorrats als drei Segmentkacheln.
 *
 * Statt der bisherigen 4px-Leiste mit Legende: die Zahlen stehen jetzt in
 * den Kacheln selbst und bleiben Links in den gefilterten Vorrat. "frisch"
 * hat keinen eigenen StatusFilter -- die Kachel führt deshalb in den
 * ungefilterten Vorrat, dieselbe Zielseite, die auch der Gesamtzähler zuvor
 * ansteuerte.
 */
function SegmentTiles({
  buckets,
}: {
  buckets: { fresh: number; soon: number; expired: number };
}) {
  return (
    <div className="mt-4 flex gap-[7px]">
      <SegmentTile href="/inventory" dot="bg-primary" value={buckets.fresh} label="frisch" />
      <SegmentTile
        href="/inventory?filter=bald"
        dot="bg-warning"
        value={buckets.soon}
        label="bald"
      />
      <SegmentTile
        href="/inventory?filter=abgelaufen"
        dot="bg-danger"
        value={buckets.expired}
        label="drüber"
      />
    </div>
  );
}

function SegmentTile({
  href,
  dot,
  value,
  label,
}: {
  href: string;
  /** Tailwind-Klasse des Punktes -- als Prop, damit der Tailwind-Scanner sie findet. */
  dot: string;
  value: number;
  label: string;
}) {
  return (
    <Link href={href} className="flex-1 rounded-lg bg-card px-3 py-[11px] shadow-row">
      <span className="flex items-center gap-1.5">
        <span className={cn("size-[9px] rounded-full", dot)} />
        <span className="font-heading text-[19px] leading-none font-bold tabular-nums">
          {value}
        </span>
      </span>
      <p className="mt-1 text-[11px] font-bold text-faint">{label}</p>
    </Link>
  );
}
