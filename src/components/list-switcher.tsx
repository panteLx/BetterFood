"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Menu,
  MenuTrigger,
  MenuPortal,
  MenuPositioner,
  MenuPopup,
  MenuItem,
  MenuSeparator,
} from "@/components/ui/menu";
import {
  Dialog,
  DialogPortal,
  DialogBackdrop,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import type { List } from "@/db/schema";

export function ListSwitcher({
  activeListId,
  lists,
}: {
  activeListId: number;
  lists: Pick<List, "id" | "name">[];
}) {
  const router = useRouter();
  const [switching, setSwitching] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);

  const activeList = lists.find((l) => l.id === activeListId);

  async function switchTo(listId: number) {
    if (listId === activeListId) return;
    setSwitching(true);
    try {
      const res = await fetch("/api/lists/active", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId }),
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      toast.error("Konnte Liste nicht wechseln.");
    } finally {
      setSwitching(false);
    }
  }

  async function createList() {
    if (!newListName.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Liste erstellt");
      setNewListName("");
      setCreateOpen(false);
      router.refresh();
    } catch {
      toast.error("Konnte Liste nicht erstellen.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Menu>
        <MenuTrigger disabled={switching} className="min-w-0 max-w-[70vw]">
          <span className="truncate text-lg font-semibold">{activeList?.name ?? "Vorrat"}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </MenuTrigger>
        <MenuPortal>
          <MenuPositioner>
            <MenuPopup>
              {lists.map((list) => (
                <MenuItem key={list.id} onClick={() => switchTo(list.id)}>
                  {list.id === activeListId ? (
                    <Check className="size-4" />
                  ) : (
                    <span className="size-4" />
                  )}
                  <span className="truncate">{list.name}</span>
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                Neue Liste
              </MenuItem>
            </MenuPopup>
          </MenuPositioner>
        </MenuPortal>
      </Menu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogPortal>
          <DialogBackdrop />
          <DialogPopup>
            <DialogTitle>Neue Liste erstellen</DialogTitle>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Name der Liste"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                autoFocus
              />
              <Button disabled={creating} onClick={createList}>
                Erstellen
              </Button>
            </div>
          </DialogPopup>
        </DialogPortal>
      </Dialog>
    </>
  );
}
