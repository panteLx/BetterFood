"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, Pencil, Trash2 } from "lucide-react";
import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useIsClient } from "@/lib/use-is-client";
import {
  STATUS_CLASSES,
  daysUntil,
  expiryLabel,
  expiryStatus,
  formatMedium,
} from "@/lib/expiry";
import {
  hideItem,
  resolveItem,
  resolveVerb,
  setQuantity,
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
  placeName,
  addedBy,
}: {
  item: Item;
  categoryLabel: string;
  placeName: string | null;
  addedBy: { name: string; email: string } | null;
}) {
  const router = useRouter();
  const [quantity, setLocalQuantity] = useState(item.quantity);
  const [busy, setBusy] = useState(false);

  const isClient = useIsClient();
  const days = isClient ? daysUntil(item.expiryDate) : 0;
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
        remaining > 0 ? `1× ${item.name} ${verb} – noch ${remaining} übrig` : `${item.name} ${verb}`,
        {
          action: {
            label: "Rückgängig",
            onClick: async () => {
              try {
                await undoResolve(undo, before);
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
        router.push("/");
        router.refresh();
      }
    } catch {
      toast.error("Konnte nicht aktualisiert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function addOne() {
    const next = quantity + 1;
    setBusy(true);
    setLocalQuantity(next);
    try {
      await setQuantity(item.id, next);
      toast.success(`${item.name} – jetzt ${next}× im Vorrat`, {
        action: {
          label: "Rückgängig",
          onClick: async () => {
            setLocalQuantity(quantity);
            try {
              await setQuantity(item.id, quantity);
            } catch {
              toast.error("Rückgängig machen hat nicht geklappt.");
            }
            router.refresh();
          },
        },
      });
      router.refresh();
    } catch {
      toast.error("Konnte nicht aktualisiert werden.");
      setLocalQuantity(quantity);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await hideItem(item.id);
      toast.success(`${item.name} gelöscht`);
      router.push("/");
      router.refresh();
    } catch {
      toast.error("Konnte Artikel nicht löschen.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-0 px-5 pt-2">
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon-touch"
            aria-label="Zurück"
            onClick={() => router.back()}
            className="-ml-1.5 rounded-2xl"
          >
            <ArrowLeft className="size-5.5" />
          </Button>
          <div className="flex gap-1">
            {/* Ein echter Link statt eines Buttons mit render-Prop: Base UI
                besteht zu Recht auf einem nativen <button>, und Bearbeiten
                ist ohnehin eine Navigation, kein Formularknopf. */}
            <Link
              href={`/edit/${item.id}`}
              aria-label="Artikel bearbeiten"
              className="flex size-11 items-center justify-center rounded-2xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Pencil className="size-5" />
            </Link>
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost"
                  size="icon-touch"
                  disabled={busy}
                  aria-label="Artikel löschen"
                  className="-mr-1.5 rounded-2xl text-danger"
                >
                  <Trash2 className="size-5" />
                </Button>
              }
              title={<>„{item.name}“ löschen?</>}
              description="Der Artikel verschwindet aus deinem Vorrat und zählt nicht als aufgebraucht."
              confirmLabel="Löschen"
              onConfirm={remove}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 pt-3.5 pb-6.5">
          <span
            className={cn(
              "flex size-23 items-center justify-center rounded-[30px]",
              styles.tint,
              styles.text,
            )}
          >
            <CategoryIcon categoryKey={item.category} className="size-11.5" strokeWidth={1.5} />
          </span>
          <div className="text-center">
            <h1 className="text-2xl leading-snug text-balance">{item.name}</h1>
            <p className="mt-1.5 text-[13.5px] font-medium text-muted-foreground">
              {categoryLabel}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex h-8.5 items-center rounded-xl px-4 text-sm font-bold",
              styles.chip,
              !isClient && "opacity-0",
            )}
          >
            {expiryLabel(days, item.expiryDate)}
          </span>
        </div>

        <dl className="overflow-hidden rounded-3xl border border-border bg-card">
          <DetailRow label="Haltbar bis" value={formatMedium(item.expiryDate)} />
          <DetailRow label="Ort" value={placeName ?? "Nicht zugeordnet"} />
          <DetailRow label="Menge" value={`${quantity}×`} />
          <DetailRow label="Hinzugefügt" value={formatMedium(item.addedAt)} />
          <DetailRow label="Eingetragen von" value={addedBy?.name ?? "Unbekannt"} last />
        </dl>

        {item.note && (
          <p className="mt-3 rounded-[20px] border border-border bg-surface-2 px-4 py-3.5 text-sm leading-relaxed font-medium text-balance text-muted-foreground">
            {item.note}
          </p>
        )}
      </div>

      <div className="sticky bottom-0 flex flex-col gap-2.5 border-t border-border bg-card px-5 pt-3.5 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={busy}
          onClick={() => resolve("used")}
          className="flex h-14 items-center justify-center gap-2.5 rounded-lg bg-primary text-base font-bold text-primary-foreground disabled:opacity-60"
        >
          <Check className="size-5" strokeWidth={2.3} />
          Aufgebraucht
        </button>
        <div className="flex gap-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={addOne}
            className="h-12.5 flex-1 rounded-lg border border-border bg-card text-[15px] font-semibold disabled:opacity-60"
          >
            Nachgekauft
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => resolve("thrown_away")}
            className="h-12.5 flex-1 rounded-lg border border-danger bg-danger-tint text-[15px] font-bold text-danger disabled:opacity-60"
          >
            Weggeworfen
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  last = false,
}: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-4 py-3.5",
        !last && "border-b border-border",
      )}
    >
      <dt className="flex-1 text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-bold">{value}</dd>
    </div>
  );
}
