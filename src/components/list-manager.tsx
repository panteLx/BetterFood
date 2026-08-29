"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ChevronDown, Plus, RotateCcw, Trash2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserCombobox } from "@/components/user-combobox";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogBackdrop,
  AlertDialogPopup,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogActions,
  AlertDialogClose,
} from "@/components/ui/alert-dialog";
import type { List } from "@/db/schema";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Member = { userId: string; name: string; email: string; isOwner: boolean };

function initialsOf(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function ListManager() {
  const router = useRouter();
  const { data: session } = useSession();
  const [lists, setLists] = useState<List[]>([]);
  const [archivedLists, setArchivedLists] = useState<List[]>([]);
  const [activeListId, setActiveListId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [expandedListId, setExpandedListId] = useState<number | null>(null);
  const [members, setMembers] = useState<Record<number, Member[]>>({});
  const [showArchived, setShowArchived] = useState(false);

  function load() {
    fetch("/api/lists")
      .then((res) => res.json())
      .then((data: { lists: List[]; archivedLists: List[]; activeListId: number }) => {
        setLists(data.lists);
        setArchivedLists(data.archivedLists);
        setActiveListId(data.activeListId);
      })
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  function loadMembers(listId: number) {
    fetch(`/api/lists/${listId}/members`)
      .then((res) => res.json())
      .then((data: { members: Member[] }) => {
        setMembers((prev) => ({ ...prev, [listId]: data.members }));
      });
  }

  function toggleExpanded(listId: number) {
    const next = expandedListId === listId ? null : listId;
    setExpandedListId(next);
    if (next !== null && !members[next]) loadMembers(next);
  }

  async function call(
    input: string,
    init: RequestInit,
    onSuccess: string,
    fallbackError: string,
  ) {
    setBusy(true);
    try {
      const res = await fetch(input, init);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? fallbackError);
      }
      if (onSuccess) toast.success(onSuccess);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : fallbackError);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function switchTo(listId: number) {
    if (listId === activeListId) return;
    const ok = await call(
      "/api/lists/active",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId }),
      },
      "Liste gewechselt",
      "Konnte Liste nicht wechseln.",
    );
    if (ok) {
      setActiveListId(listId);
      router.refresh();
    }
  }

  async function createList() {
    if (!newListName.trim()) {
      toast.error("Bitte einen Namen eingeben.");
      return;
    }
    const ok = await call(
      "/api/lists",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newListName.trim() }),
      },
      "Liste erstellt und aktiviert",
      "Konnte Liste nicht erstellen.",
    );
    if (ok) {
      setNewListName("");
      load();
      router.refresh();
    }
  }

  async function addMember(listId: number, userId: string) {
    const ok = await call(
      `/api/lists/${listId}/members`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      },
      "Mitglied hinzugefügt",
      "Konnte Mitglied nicht hinzufügen.",
    );
    if (ok) loadMembers(listId);
  }

  async function removeMember(listId: number, userId: string, isSelf: boolean) {
    const ok = await call(
      `/api/lists/${listId}/members/${userId}`,
      { method: "DELETE" },
      isSelf ? "Liste verlassen" : "Mitglied entfernt",
      "Konnte Mitglied nicht entfernen.",
    );
    if (!ok) return;
    if (isSelf) {
      setExpandedListId(null);
      load();
      router.refresh();
    } else {
      loadMembers(listId);
    }
  }

  async function setArchived(listId: number, archived: boolean) {
    const ok = await call(
      `/api/lists/${listId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      },
      archived ? "Liste archiviert" : "Liste reaktiviert",
      "Aktion fehlgeschlagen.",
    );
    if (ok) load();
  }

  async function deleteList(listId: number) {
    const ok = await call(
      `/api/lists/${listId}`,
      { method: "DELETE" },
      "Liste endgültig gelöscht",
      "Konnte Liste nicht löschen.",
    );
    if (ok) load();
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="px-1 text-[12.5px] leading-relaxed font-medium text-balance text-muted-foreground">
        Jede Liste ist ein eigener Vorrat. Teile eine Liste, damit alle im Haushalt denselben Stand
        sehen.
      </p>

      {loading ? (
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="h-[70px] animate-pulse rounded-[20px] bg-muted" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {lists.map((list) => {
            const isOwner = session ? list.ownerId === session.user.id : false;
            const isActive = list.id === activeListId;
            const listMembers = members[list.id];
            const expanded = expandedListId === list.id;

            return (
              <div
                key={list.id}
                className={cn(
                  "overflow-hidden rounded-[20px] border bg-card",
                  isActive ? "border-primary" : "border-border",
                )}
              >
                <div className="flex items-center gap-3 p-3.5">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={expanded}
                    onClick={() => toggleExpanded(list.id)}
                  >
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 text-faint transition-transform",
                        expanded && "rotate-180",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-bold">{list.name}</span>
                      <span className="mt-1 block text-[12.5px] font-medium text-muted-foreground">
                        {isOwner ? "Deine Liste" : "Geteilte Liste"}
                        {listMembers &&
                          ` · ${listMembers.length} ${listMembers.length === 1 ? "Mitglied" : "Mitglieder"}`}
                      </span>
                    </span>
                  </button>
                  {isActive ? (
                    <span className="inline-flex h-6.5 shrink-0 items-center rounded-[9px] bg-primary-tint px-2.5 text-[11.5px] font-bold text-primary">
                      Aktiv
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => switchTo(list.id)}
                      className="inline-flex h-6.5 shrink-0 items-center rounded-[9px] bg-surface-2 px-2.5 text-[11.5px] font-bold text-muted-foreground disabled:opacity-60"
                    >
                      Wechseln
                    </button>
                  )}
                </div>

                {expanded && (
                  <div className="flex flex-col gap-3 border-t border-border p-3.5">
                    {!listMembers ? (
                      <p className="text-xs font-medium text-muted-foreground">Lädt…</p>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {listMembers.map((member) => {
                          const isSelf = session ? member.userId === session.user.id : false;
                          const canRemove = !member.isOwner && (isOwner || isSelf);
                          return (
                            <div key={member.userId} className="flex items-center gap-3">
                              <span
                                className={cn(
                                  "flex size-9 shrink-0 items-center justify-center rounded-xl text-[13px] font-extrabold",
                                  member.isOwner
                                    ? "bg-primary-tint text-primary"
                                    : "bg-surface-2 text-muted-foreground",
                                )}
                              >
                                {initialsOf(member.name)}
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">
                                  {member.name}
                                </span>
                                <span className="mt-0.5 block truncate text-xs font-medium text-muted-foreground">
                                  {member.isOwner ? "Besitzer:in" : member.email}
                                </span>
                              </span>
                              {canRemove && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="shrink-0 rounded-xl"
                                  aria-label={isSelf ? "Liste verlassen" : "Mitglied entfernen"}
                                  onClick={() => removeMember(list.id, member.userId, isSelf)}
                                >
                                  <X className="size-4" />
                                </Button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex items-center gap-2.5">
                      <UserPlus className="size-4 shrink-0 text-faint" />
                      <div className="min-w-0 flex-1">
                        <UserCombobox onSelect={(user) => addMember(list.id, user.id)} />
                      </div>
                    </div>

                    {isOwner && (
                      <div className="flex justify-end gap-2 border-t border-border pt-3">
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-xl"
                          disabled={busy}
                          onClick={() => setArchived(list.id, true)}
                        >
                          <Archive className="size-4" />
                          Archivieren
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button
                                size="sm"
                                variant="destructive"
                                className="rounded-xl"
                                disabled={busy}
                              />
                            }
                          >
                            <Trash2 className="size-4" />
                            Löschen
                          </AlertDialogTrigger>
                          <AlertDialogPortal>
                            <AlertDialogBackdrop />
                            <AlertDialogPopup>
                              <AlertDialogTitle>Liste endgültig löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                „{list.name}“ wird inklusive aller Artikel, Kategorien, Orte und
                                Mitgliedschaften unwiderruflich gelöscht.
                              </AlertDialogDescription>
                              <AlertDialogActions>
                                <AlertDialogClose render={<Button variant="outline" />}>
                                  Abbrechen
                                </AlertDialogClose>
                                <AlertDialogClose
                                  render={<Button variant="destructive" />}
                                  onClick={() => deleteList(list.id)}
                                >
                                  Löschen
                                </AlertDialogClose>
                              </AlertDialogActions>
                            </AlertDialogPopup>
                          </AlertDialogPortal>
                        </AlertDialog>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {archivedLists.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            className="flex items-center gap-1.5 px-1 text-left text-xs font-semibold text-muted-foreground"
            onClick={() => setShowArchived((value) => !value)}
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", showArchived && "rotate-180")}
            />
            Archivierte Listen ({archivedLists.length})
          </button>
          {showArchived &&
            archivedLists.map((list) => (
              <div
                key={list.id}
                className="flex items-center gap-3 rounded-[20px] border border-dashed border-border p-3.5"
              >
                <p className="min-w-0 flex-1 truncate text-sm font-semibold text-muted-foreground">
                  {list.name}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  disabled={busy}
                  onClick={() => setArchived(list.id, false)}
                >
                  <RotateCcw className="size-4" />
                  Reaktivieren
                </Button>
              </div>
            ))}
        </div>
      )}

      <div className="flex gap-2">
        <input
          value={newListName}
          onChange={(event) => setNewListName(event.target.value)}
          placeholder="Neue Liste"
          className="h-12 min-w-0 flex-1 rounded-2xl border border-border bg-card px-3.5 text-sm font-semibold outline-none placeholder:text-faint"
        />
        <button
          type="button"
          disabled={busy}
          onClick={createList}
          aria-label="Liste erstellen"
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground disabled:opacity-60"
        >
          <Plus className="size-5" strokeWidth={2.3} />
        </button>
      </div>
    </div>
  );
}
