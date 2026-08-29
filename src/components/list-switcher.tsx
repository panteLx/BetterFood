"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { List } from "@/db/schema";

/**
 * Der Listenwechsel als Blatt statt als Menue.
 *
 * Eine Liste zu wechseln tauscht den kompletten Vorrat aus -- das ist keine
 * Nebensaechlichkeit, die in ein kleines Dropdown gehoert. Im Blatt steht zu
 * jeder Liste, wie viele Artikel und Mitglieder sie hat, und das Anlegen
 * einer neuen liegt daneben statt hinter einem zweiten Dialog.
 */
export function ListSwitcher({
  activeListId,
  lists,
}: {
  activeListId: number;
  lists: (Pick<List, "id" | "name"> & { itemCount: number; memberCount: number })[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newListName, setNewListName] = useState("");

  const activeList = lists.find((list) => list.id === activeListId);

  async function switchTo(listId: number) {
    if (listId === activeListId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/lists/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId }),
      });
      if (!res.ok) throw new Error();
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Konnte Liste nicht wechseln.");
    } finally {
      setBusy(false);
    }
  }

  async function createList() {
    if (!newListName.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Liste erstellt");
      setNewListName("");
      setOpen(false);
      router.refresh();
    } catch {
      toast.error("Konnte Liste nicht erstellen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9.5 max-w-[55%] shrink-0 items-center gap-1.5 rounded-[13px] border border-border bg-card px-3 text-[13px] font-bold outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span className="truncate">{activeList?.name ?? "Vorrat"}</span>
        <ChevronDown className="size-3.5 shrink-0 text-faint" strokeWidth={2.2} />
      </button>

      <Sheet open={open} onOpenChange={setOpen} title="Liste wechseln">
        <div className="flex flex-col gap-1.5">
          {lists.map((list) => {
            const active = list.id === activeListId;
            return (
              <button
                key={list.id}
                type="button"
                disabled={busy}
                onClick={() => switchTo(list.id)}
                className={cn(
                  "flex items-center gap-3 rounded-[18px] border px-3.5 py-3.5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60",
                  active ? "border-primary bg-primary-tint" : "border-border bg-surface-2",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-bold">{list.name}</span>
                  <span className="mt-1 block text-[12.5px] font-medium text-muted-foreground">
                    {list.itemCount} Artikel ·{" "}
                    {list.memberCount === 1 ? "nur du" : `${list.memberCount} Mitglieder`}
                  </span>
                </span>
                {active && <Check className="size-5 shrink-0 text-primary" strokeWidth={2.4} />}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            placeholder="Neue Liste"
            className="h-12.5 min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-3.5 text-sm font-semibold outline-none placeholder:text-faint"
          />
          <button
            type="button"
            disabled={busy}
            onClick={createList}
            className="h-12.5 shrink-0 rounded-lg bg-primary px-4.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            Erstellen
          </button>
        </div>
      </Sheet>
    </>
  );
}
