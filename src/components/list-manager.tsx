"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Plus, UserPlus, Check, X, Archive, RotateCcw, Trash2, ChevronDown } from "lucide-react";
import type { List } from "@/db/schema";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type Member = { userId: string; name: string; email: string; isOwner: boolean };

export function ListManager() {
  const router = useRouter();
  const { data: session } = useSession();
  const [lists, setLists] = useState<List[]>([]);
  const [archivedLists, setArchivedLists] = useState<List[]>([]);
  const [activeListId, setActiveListId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);
  const [expandedListId, setExpandedListId] = useState<number | null>(null);
  const [members, setMembers] = useState<Record<number, Member[]>>({});
  const [showArchived, setShowArchived] = useState(false);
  const [busyListId, setBusyListId] = useState<number | null>(null);

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

  useEffect(() => {
    load();
  }, []);

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
    if (next !== null && !members[next]) {
      loadMembers(next);
    }
  }

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
      setActiveListId(listId);
      toast.success("Liste gewechselt");
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
      toast.success("Liste erstellt und aktiviert");
      setNewListName("");
      load();
      router.refresh();
    } catch {
      toast.error("Konnte Liste nicht erstellen.");
    } finally {
      setCreating(false);
    }
  }

  async function addMember(listId: number, userId: string) {
    try {
      const res = await fetch(`/api/lists/${listId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Konnte Mitglied nicht hinzufügen.");
      }
      toast.success("Mitglied hinzugefügt");
      loadMembers(listId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Konnte Mitglied nicht hinzufügen.");
    }
  }

  async function removeMember(listId: number, userId: string, isSelf: boolean) {
    try {
      const res = await fetch(`/api/lists/${listId}/members/${userId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Konnte Mitglied nicht entfernen.");
      }
      toast.success(isSelf ? "Liste verlassen" : "Mitglied entfernt");
      if (isSelf) {
        setExpandedListId(null);
        load();
        router.refresh();
      } else {
        loadMembers(listId);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Konnte Mitglied nicht entfernen.");
    }
  }

  async function setArchived(listId: number, archived: boolean) {
    setBusyListId(listId);
    try {
      const res = await fetch(`/api/lists/${listId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Aktion fehlgeschlagen.");
      }
      toast.success(archived ? "Liste archiviert" : "Liste reaktiviert");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusyListId(null);
    }
  }

  async function deleteList(listId: number) {
    setBusyListId(listId);
    try {
      const res = await fetch(`/api/lists/${listId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? "Konnte Liste nicht löschen.");
      }
      toast.success("Liste endgültig gelöscht");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Konnte Liste nicht löschen.");
    } finally {
      setBusyListId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Label>Listen</Label>

      {loading ? (
        <p className="text-sm text-muted-foreground">Lädt…</p>
      ) : (
        <div className="flex flex-col gap-2">
          {lists.map((list) => {
            const isOwner = session ? list.ownerId === session.user.id : false;
            const listMembers = members[list.id];

            return (
              <div key={list.id} className="flex flex-col gap-2 rounded-lg border border-input p-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                    onClick={() => toggleExpanded(list.id)}
                  >
                    <ChevronDown
                      className={cn(
                        "size-3.5 shrink-0 text-muted-foreground transition-transform",
                        expandedListId === list.id && "rotate-180",
                      )}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{list.name}</p>
                      {!isOwner && <p className="text-xs text-muted-foreground">Geteilte Liste</p>}
                    </div>
                  </button>
                  {list.id === activeListId ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      <Check className="size-3.5" />
                      Aktiv
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={switching}
                      onClick={() => switchTo(list.id)}
                    >
                      Wechseln
                    </Button>
                  )}
                </div>

                {expandedListId === list.id && (
                  <div className="flex flex-col gap-2 border-t border-input pt-2">
                    {!listMembers ? (
                      <p className="text-xs text-muted-foreground">Lädt…</p>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {listMembers.map((member) => {
                          const isSelf = session ? member.userId === session.user.id : false;
                          const canRemove = !member.isOwner && (isOwner || isSelf);
                          return (
                            <div
                              key={member.userId}
                              className="flex items-center justify-between gap-2 text-sm"
                            >
                              <div className="min-w-0">
                                <p className="truncate">
                                  {member.name}
                                  {member.isOwner && (
                                    <span className="ml-1.5 text-xs text-muted-foreground">
                                      (Besitzer)
                                    </span>
                                  )}
                                </p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {member.email}
                                </p>
                              </div>
                              {canRemove && (
                                <Button
                                  size="icon"
                                  variant="outline"
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

                    <div className="flex items-center gap-2">
                      <UserPlus className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <UserCombobox onSelect={(u) => addMember(list.id, u.id)} />
                      </div>
                    </div>

                    {isOwner && (
                      <div className="flex justify-end gap-2 border-t border-input pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyListId === list.id}
                          onClick={() => setArchived(list.id, true)}
                        >
                          <Archive className="size-4" />
                          Archivieren
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger
                            render={
                              <Button size="sm" variant="destructive" disabled={busyListId === list.id} />
                            }
                          >
                            <Trash2 className="size-4" />
                            Endgültig löschen
                          </AlertDialogTrigger>
                          <AlertDialogPortal>
                            <AlertDialogBackdrop />
                            <AlertDialogPopup>
                              <AlertDialogTitle>Liste endgültig löschen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                &quot;{list.name}&quot; wird inklusive aller Artikel, Kategorien und
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
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="flex items-center gap-1.5 text-left text-xs text-muted-foreground"
            onClick={() => setShowArchived((v) => !v)}
          >
            <ChevronDown
              className={cn("size-3.5 transition-transform", showArchived && "rotate-180")}
            />
            Archivierte Listen ({archivedLists.length})
          </button>
          {showArchived && (
            <div className="flex flex-col gap-2">
              {archivedLists.map((list) => (
                <div
                  key={list.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-input p-2"
                >
                  <p className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{list.name}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyListId === list.id}
                    onClick={() => setArchived(list.id, false)}
                  >
                    <RotateCcw className="size-4" />
                    Reaktivieren
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-lg border border-dashed border-input p-2">
        <Input
          placeholder="Neue Liste"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          className="flex-1"
        />
        <Button size="icon" disabled={creating} onClick={createList} aria-label="Liste erstellen">
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}
