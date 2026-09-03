"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Pencil, Trash2 } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateSheet } from "@/components/date-sheet";
import { useIsClient } from "@/lib/use-is-client";
import { estimateExpiryDate } from "@/lib/categories";
import {
  STATUS_CLASSES,
  daysUntil,
  expiryLabel,
  expiryStatus,
  formatMedium,
  fromDateInputValue,
  startOfDay,
  toDateInputValue,
} from "@/lib/expiry";
import {
  hideItem,
  resolveItem,
  resolveVerb,
  restockItem,
  undoResolve,
  type ResolveStatus,
} from "@/lib/item-actions";
import { cn } from "@/lib/utils";
import type { Item } from "@/db/schema";

/**
 * Die Detailseite eines Artikels.
 *
 * Sie ist der Ort, an dem alles steht, was in der Zeile keinen Platz hat --
 * Ort, Menge, Notiz, wer ihn eingetragen hat --, und zugleich der barrierefreie
 * Gegenpart zur Wischgeste im Vorrat: dieselben drei Entscheidungen
 * (aufgebraucht, nachgekauft, weggeworfen) als richtige Buttons.
 */
export function ItemDetail({
  item,
  categoryLabel,
  shelfLifeDays,
  placeName,
  addedBy,
}: {
  item: Item;
  categoryLabel: string;
  /** Haltbarkeit der Kategorie -- der Vorschlag beim Nachkauf. Null, wenn die Kategorie geloescht wurde. */
  shelfLifeDays: number | null;
  placeName: string | null;
  addedBy: { name: string; email: string } | null;
}) {
  const router = useRouter();
  const [quantity, setLocalQuantity] = useState(item.quantity);
  const [prevItemQuantity, setPrevItemQuantity] = useState(item.quantity);
  const [busy, setBusy] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockDate, setRestockDate] = useState("");

  // Die Menge wird optimistisch im Client gefuehrt, damit ein Tipp sofort
  // sichtbar ist. Sobald der Server eine andere Zahl liefert -- nach dem
  // router.refresh() eines Rueckgaengig, oder weil jemand anderes an
  // derselben Liste etwas geaendert hat --, gewinnt sie. Ohne diesen
  // Abgleich blieb der Zaehler nach dem Zuruecknehmen eines Verbrauchs auf
  // dem verringerten Wert stehen, bis die Seite neu geladen wurde: der
  // useState-Initialwert laeuft nur beim ersten Rendern.
  if (item.quantity !== prevItemQuantity) {
    setPrevItemQuantity(item.quantity);
    setLocalQuantity(item.quantity);
  }

  const isClient = useIsClient();
  const days = isClient ? daysUntil(item.expiryDate) : 0;

  /**
   * Nach der letzten Einheit hat diese Seite nichts mehr zu zeigen -- der
   * Weg zurueck ist der, ueber den man hergekommen ist: Vorrat, Startseite
   * oder ein Suchergebnis. Vorher landete jeder hier auf der Startseite und
   * musste sich seinen Filter neu zusammensuchen.
   *
   * Nur wenn es keine Historie gibt (Deep-Link aus einer Benachrichtigung,
   * Neuladen der Seite), bleibt die Startseite der einzige Ausweg.
   */
  function leave() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }
  const status = expiryStatus(days);
  const styles = STATUS_CLASSES[status];

  async function resolve(nextStatus: ResolveStatus) {
    setBusy(true);
    const before = quantity;
    const remaining = before - 1;
    try {
      const undo = await resolveItem(item.id, nextStatus);
      const verb = resolveVerb(nextStatus);
      toast.success(
        remaining > 0 ? `1× ${item.name} ${verb}` : `${item.name} ${verb}`,
        {
          description: remaining > 0 ? `Noch ${remaining} übrig` : undefined,
          action: {
            label: "Rückgängig",
            onClick: async () => {
              try {
                await undoResolve(undo, before);
                setLocalQuantity(before);
                toast.success("Wiederhergestellt");
              } catch {
                toast.error("Rückgängig machen hat nicht geklappt.");
              }
              router.refresh();
            },
          },
        },
      );
      // Bei der letzten Einheit gibt es hier nichts mehr zu sehen -- der
      // Artikel liegt jetzt im Archiv.
      if (remaining > 0) {
        setLocalQuantity(remaining);
        router.refresh();
      } else {
        leave();
        router.refresh();
      }
    } catch {
      toast.error("Konnte nicht aktualisiert werden.");
    } finally {
      setBusy(false);
    }
  }

  /**
   * Der Nachkauf fragt nach dem MHD der neuen Packung, statt stillschweigend
   * die Menge zu erhoehen: eine zweite Milch teilt sich nicht das
   * Haltbarkeitsdatum der ersten. Was daraus wird, entscheidet die Route --
   * gleiches Datum heisst dieselbe Zeile mit hoeherer Menge, ein anderes eine
   * eigene Zeile, die dann auch eigenstaendig gemeldet wird.
   */
  function openRestock() {
    const today = startOfDay(new Date());
    setRestockDate(
      shelfLifeDays === null
        ? ""
        : toDateInputValue(estimateExpiryDate(shelfLifeDays, today)),
    );
    setRestockOpen(true);
  }

  async function restock(value: string) {
    if (!value) return;
    const expiry = fromDateInputValue(value);
    setBusy(true);
    try {
      const result = await restockItem(item, expiry);
      if (result.id === item.id) {
        // Gleiches MHD, gleiche Zeile: hier aendert sich nur die Menge.
        const next = quantity + 1;
        setLocalQuantity(next);
        toast.success(`${item.name} – jetzt ${next}× im Vorrat`);
        router.refresh();
      } else {
        // Eigene Zeile -- und die zeigen wir auch, sonst sieht es aus, als
        // sei nichts passiert: diese Seite hier hat sich ja nicht geaendert.
        toast.success(`${item.name} – neue Packung bis ${formatMedium(expiry)}`);
        router.push(`/item/${result.id}`);
        router.refresh();
      }
    } catch {
      toast.error("Konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await hideItem(item.id);
      toast.success(`${item.name} gelöscht`);
      leave();
      router.refresh();
    } catch {
      toast.error("Konnte Artikel nicht löschen.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-0 px-[18px] pt-2">
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="icon-touch"
            aria-label="Zurück"
            onClick={leave}
            className="rounded-full"
          >
            <ArrowLeft className="size-5" strokeWidth={2.4} />
          </Button>
          <div className="flex gap-2">
            {/* Ein echter Link statt eines Buttons mit render-Prop: Base UI
                besteht zu Recht auf einem nativen <button>, und Bearbeiten
                ist ohnehin eine Navigation, kein Formularknopf. */}
            <Link
              href={`/edit/${item.id}`}
              aria-label="Artikel bearbeiten"
              className="flex size-11 items-center justify-center rounded-full bg-card text-foreground shadow-row outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Pencil className="size-[19px]" strokeWidth={2.2} />
            </Link>
            <ConfirmDialog
              trigger={
                <Button
                  variant="outline"
                  size="icon-touch"
                  disabled={busy}
                  aria-label="Artikel löschen"
                  className="rounded-full text-danger-ink"
                >
                  <Trash2 className="size-[19px]" strokeWidth={2.2} />
                </Button>
              }
              title={<>„{item.name}“ löschen?</>}
              description="Der Artikel verschwindet aus deinem Vorrat und zählt nicht als aufgebraucht."
              confirmLabel="Löschen"
              onConfirm={remove}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-3.5 pt-[18px] pb-6">
          <span
            className={cn(
              "flex size-26 items-center justify-center rounded-[36px]",
              styles.tint,
              styles.text,
            )}
          >
            <CategoryIcon
              categoryKey={item.category}
              className="size-[50px]"
              strokeWidth={1.6}
            />
          </span>
          <div className="text-center">
            <h1 className="text-[26px] leading-[1.25] text-balance">{item.name}</h1>
            <p className="mt-1.5 text-[13.5px] font-semibold text-muted-foreground">
              {categoryLabel}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex h-[38px] items-center rounded-full px-[18px] font-heading text-[15px] font-bold",
              styles.chip,
              !isClient && "opacity-0",
            )}
          >
            {expiryLabel(days, item.expiryDate)}
          </span>
        </div>

        <dl className="overflow-hidden rounded-[28px] bg-card px-[18px] py-1 shadow-card">
          <DetailRow label="Haltbar bis" value={formatMedium(item.expiryDate)} />
          <DetailRow label="Ort" value={placeName ?? "Nicht zugeordnet"} />
          <DetailRow
            label="Menge"
            value={
              <span className="inline-flex h-[26px] items-center rounded-full bg-primary-tint px-[11px] font-heading text-sm font-bold text-primary-deep">
                {quantity}×
              </span>
            }
          />
          <DetailRow label="Hinzugefügt" value={formatMedium(item.addedAt)} />
          <DetailRow
            label="Eingetragen von"
            value={addedBy?.name ?? "Unbekannt"}
            last
          />
        </dl>

        {item.note && (
          <p className="mt-3 rounded-[24px] bg-surface-2 px-[18px] py-3.5 text-sm leading-[1.65] font-semibold text-pretty text-muted-foreground">
            {item.note}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2.5 rounded-t-[32px] bg-card px-[18px] pt-4 pb-[max(env(safe-area-inset-bottom),20px)] shadow-sheet">
        <button
          type="button"
          disabled={busy}
          onClick={() => resolve("used")}
          className="flex h-[58px] items-center justify-center gap-2.5 rounded-[22px] bg-(image:--gradient-primary) font-heading text-[17px] font-bold text-primary-foreground shadow-cta disabled:opacity-60"
        >
          <Check className="size-5" strokeWidth={2.8} />
          Aufgebraucht
        </button>
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={openRestock}
            className="h-[52px] flex-1 rounded-lg bg-surface-2 font-heading text-[15px] font-bold disabled:opacity-60"
          >
            Nachgekauft
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => resolve("thrown_away")}
            className="h-[52px] flex-1 rounded-lg bg-danger-tint font-heading text-[15px] font-bold text-danger-ink disabled:opacity-60"
          >
            Weggeworfen
          </button>
        </div>
      </div>

      {/* Erst mit dem Datum wird der Nachkauf eingetragen -- ausgeloest nur
          vom Abschlussknopf, damit ein Tipp neben das Blatt keine Packung
          anlegt. */}
      {isClient && (
        <DateSheet
          open={restockOpen}
          onOpenChange={setRestockOpen}
          title="Neue Packung hält bis"
          confirmLabel="Nachkauf eintragen"
          value={restockDate}
          onChange={setRestockDate}
          onConfirm={restock}
          today={startOfDay(new Date())}
        />
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 py-3.5",
        !last && "border-b border-hairline",
      )}
    >
      <dt className="flex-1 text-[13.5px] font-semibold text-muted-foreground">
        {label}
      </dt>
      <dd className="text-right font-heading text-[14.5px] font-bold">{value}</dd>
    </div>
  );
}
