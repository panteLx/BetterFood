"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Pencil, Plus, Refrigerator, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogPortal,
  AlertDialogBackdrop,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogActions,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";
import type { Place } from "@/db/schema";

export type PlaceWithCount = Place & { itemCount: number };

/**
 * Die Faecher, in denen der Vorrat liegt.
 *
 * Steht hier neben Produkten und Kategorien, weil es dieselbe Art von Wissen
 * ist: nichts davon ist ein Artikel, alles davon beschreibt, wie dieser
 * Haushalt seinen Vorrat sortiert.
 */
export function PlaceManager({ places }: { places: PlaceWithCount[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PlaceWithCount | null>(null);

  async function call(input: string, init: RequestInit, success: string, failure: string) {
    setSaving(true);
    try {
      const res = await fetch(input, init);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? failure);
      }
      toast.success(success);
      router.refresh();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : failure);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(id: number) {
    if (!editName.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    const ok = await call(
      `/api/places/${id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      },
      "Ort gespeichert",
      "Konnte Ort nicht speichern.",
    );
    if (ok) setEditingId(null);
  }

  async function addPlace() {
    if (!newName.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    const ok = await call(
      "/api/places",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      },
      "Ort hinzugefügt",
      "Konnte Ort nicht anlegen.",
    );
    if (ok) setNewName("");
  }

  async function removePlace(place: PlaceWithCount) {
    setPendingDelete(null);
    await call(
      `/api/places/${place.id}`,
      { method: "DELETE" },
      `„${place.name}“ entfernt`,
      "Konnte Ort nicht entfernen.",
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <p className="px-1 text-[12.5px] leading-relaxed font-medium text-balance text-muted-foreground">
        Orte sind die Fächer, in denen dein Vorrat liegt. Du wählst sie beim Erfassen aus und
        kannst den Vorrat danach gruppieren.
      </p>

      {places.map((place) => (
        <div
          key={place.id}
          className="flex items-center gap-2.5 rounded-[18px] border border-border bg-card px-3.5 py-2.5"
        >
          <span className="flex size-9.5 shrink-0 items-center justify-center rounded-[13px] bg-primary-tint text-primary">
            <Refrigerator className="size-4.5" strokeWidth={1.7} />
          </span>

          {editingId === place.id ? (
            <>
              <input
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
                autoFocus
                aria-label="Name des Ortes"
                className="h-10.5 min-w-0 flex-1 rounded-[13px] border border-primary bg-surface-2 px-2.5 text-sm font-bold outline-none"
              />
              <Button
                size="icon"
                className="size-10 shrink-0 rounded-[13px]"
                disabled={saving}
                onClick={() => saveEdit(place.id)}
                aria-label="Speichern"
              >
                <Check className="size-4.5" strokeWidth={2.4} />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="size-10 shrink-0 rounded-[13px]"
                onClick={() => setEditingId(null)}
                aria-label="Abbrechen"
              >
                <X className="size-4" strokeWidth={2.3} />
              </Button>
            </>
          ) : (
            <>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] leading-tight font-bold">{place.name}</p>
                <p className="mt-1 text-xs leading-none font-medium text-muted-foreground">
                  {place.itemCount} {place.itemCount === 1 ? "Artikel" : "Artikel"}
                </p>
              </div>
              <Button
                size="icon"
                variant="outline"
                className="size-10 shrink-0 rounded-[13px]"
                disabled={saving}
                onClick={() => {
                  setEditingId(place.id);
                  setEditName(place.name);
                }}
                aria-label={`${place.name} umbenennen`}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="size-10 shrink-0 rounded-[13px] text-danger"
                disabled={saving}
                onClick={() => setPendingDelete(place)}
                aria-label={`${place.name} löschen`}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          )}
        </div>
      ))}

      <div className="flex gap-2 rounded-[18px] border border-dashed border-border bg-card p-2.5">
        <input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="Neuer Ort, z. B. Keller"
          aria-label="Name des neuen Ortes"
          className="h-11 min-w-0 flex-1 rounded-[14px] border border-border bg-surface-2 px-3.5 text-sm font-semibold outline-none placeholder:text-faint"
        />
        <button
          type="button"
          disabled={saving}
          onClick={addPlace}
          aria-label="Ort hinzufügen"
          className="flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-primary text-primary-foreground disabled:opacity-60"
        >
          <Plus className="size-5" strokeWidth={2.3} />
        </button>
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogPortal>
          <AlertDialogBackdrop />
          <AlertDialogPopup>
            <AlertDialogTitle>„{pendingDelete?.name}“ entfernen?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.itemCount
                ? `${pendingDelete.itemCount} Artikel liegen laut App hier. Sie bleiben im Vorrat, verlieren aber ihre Ortszuordnung.`
                : "Der Ort verschwindet aus der Auswahl beim Erfassen."}
            </AlertDialogDescription>
            <AlertDialogActions>
              <AlertDialogClose render={<Button variant="outline" />}>Abbrechen</AlertDialogClose>
              <AlertDialogClose
                render={<Button variant="destructive" />}
                onClick={() => pendingDelete && removePlace(pendingDelete)}
              >
                Entfernen
              </AlertDialogClose>
            </AlertDialogActions>
          </AlertDialogPopup>
        </AlertDialogPortal>
      </AlertDialog>
    </div>
  );
}
