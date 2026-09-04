"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronRight,
  LogOut,
  Monitor,
  ShieldCheck,
  Smartphone,
  Tablet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";
import { syncPushSubscription, unsubscribeFromPush } from "@/lib/push-client";
import { formatRelativePast } from "@/lib/relative-time";
import { useIsClient } from "@/lib/use-is-client";
import type { DeviceKind } from "@/lib/user-agent";
import { cn } from "@/lib/utils";

type Account = {
  name: string;
  email: string;
  hasPassword: boolean;
  providers: string[];
  ssoName: string;
};

type DeviceSession = {
  id: string;
  device: string;
  browser: string;
  kind: DeviceKind;
  ipAddress: string | null;
  signedInAt: string;
  current: boolean;
};

const DEVICE_ICONS: Record<DeviceKind, LucideIcon> = {
  phone: Smartphone,
  tablet: Tablet,
  desktop: Monitor,
};

const MIN_PASSWORD_LENGTH = 8;

// Dieselbe Feldform wie auf den Anmeldeseiten, nur mit dem Radius, den Blätter
// und Dialoge tragen (--radius statt der 18px der Vollbild-Formulare). Kein
// Rand mehr: die Tiefe kommt aus shadow-row, wie beim Input-Baustein.
const fieldClass =
  "h-12 w-full rounded-lg bg-surface-2 px-3.5 text-[15px] font-semibold shadow-row outline-none placeholder:text-faint focus-visible:ring-3 focus-visible:ring-ring/50";
const rowClass = "flex items-center gap-3 px-4 py-3.5";
const cardClass = "overflow-hidden rounded-[30px] bg-card shadow-card";
const sectionTitleClass = "pl-1 text-xs font-semibold tracking-wider text-faint uppercase";
const secondaryButtonClass =
  "h-12 w-full rounded-lg bg-card font-heading text-sm font-semibold shadow-row disabled:opacity-50";

/**
 * Das eigene Konto: Profil, Anmeldung, Geräte.
 *
 * Die Aufteilung folgt der Frage, die jemand mitbringt: "wie heisse ich hier"
 * (Profil), "womit komme ich rein" (Anmeldung), "wer ist sonst noch drin"
 * (Geräte). Jede Änderung wird in einem Blatt gestellt statt in einem
 * aufklappbaren Feld -- dieselbe Form, in der die App jede kurze Entscheidung
 * stellt.
 *
 * Der Name läuft über authClient direkt an better-auth: nur so wird das
 * Sitzungs-Cookie gleich mit neu geschrieben, und die Karte in den
 * Einstellungen zeigt den neuen Namen sofort. E-Mail und Passwort brauchen
 * eine eigene Route davor -- die eine für den Passwort-Nachweis und eine
 * ehrliche Antwort auf eine bereits vergebene Adresse, die andere, um die
 * neu angelegte eigene Sitzung nachträglich zu beschriften.
 */
export function AccountManager() {
  const router = useRouter();
  const isClient = useIsClient();

  const [account, setAccount] = useState<Account | null>(null);
  const [sessions, setSessions] = useState<DeviceSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const [openSheet, setOpenSheet] = useState<"name" | "email" | "password" | null>(
    null,
  );
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [revokeOthers, setRevokeOthers] = useState(true);

  function loadAccount() {
    return fetch("/api/account")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: Account | null) => {
        if (data) setAccount(data);
      });
  }

  function loadSessions() {
    return fetch("/api/account/sessions")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { sessions: DeviceSession[] } | null) => {
        if (data) setSessions(data.sessions);
      });
  }

  useEffect(() => {
    Promise.all([loadAccount(), loadSessions()])
      .catch(() => toast.error("Konnte die Kontodaten nicht laden."))
      .finally(() => setLoading(false));
  }, []);

  /**
   * Wie der Aufrufhelfer in list-manager, nur gibt er die Meldung zurueck,
   * statt sie selbst zu toasten: null heisst geklappt, sonst steht da der
   * deutsche Satz des Servers.
   *
   * Der Unterschied ist noetig, weil die Haelfte dieser Aufrufe aus einem
   * geoeffneten Blatt kommt. Der Toast sitzt unten in der Mitte und laege
   * damit genau darunter -- die Rueckmeldung "das Passwort stimmt nicht" waere
   * unsichtbar, ausgerechnet an der einzigen Stelle, an der sie zaehlt. Im
   * Blatt steht sie deshalb als Zeile ueber dem Knopf, ausserhalb als Toast.
   */
  async function request(
    input: string,
    init: RequestInit,
    fallbackError: string,
  ): Promise<string | null> {
    setBusy(true);
    try {
      const res = await fetch(input, init);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        return body?.error ?? fallbackError;
      }
      return null;
    } catch {
      return fallbackError;
    } finally {
      setBusy(false);
    }
  }

  function openSheetFor(sheet: "name" | "email" | "password") {
    setSheetError(null);
    setOpenSheet(sheet);
  }

  function closeSheet() {
    setOpenSheet(null);
    setSheetError(null);
    setEmailPassword("");
    setCurrentPassword("");
    setNewPassword("");
    setRepeatPassword("");
  }

  async function saveName() {
    const name = nameDraft.trim();
    if (!name) {
      setSheetError("Bitte einen Namen eingeben.");
      return;
    }
    if (name === account?.name) {
      closeSheet();
      return;
    }

    setBusy(true);
    const { error } = await authClient.updateUser({ name });
    setBusy(false);

    if (error) {
      setSheetError(authErrorMessage(error, "Konnte den Namen nicht ändern."));
      return;
    }

    toast.success("Name geändert");
    setAccount((previous) => (previous ? { ...previous, name } : previous));
    closeSheet();
    router.refresh();
  }

  async function saveEmail() {
    const error = await request(
      "/api/account/email",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newEmail: emailDraft.trim(),
          currentPassword: emailPassword,
        }),
      },
      "Konnte die E-Mail-Adresse nicht ändern.",
    );
    if (error) {
      setSheetError(error);
      return;
    }

    toast.success("E-Mail geändert");
    closeSheet();
    await loadAccount();
    router.refresh();
  }

  async function savePassword() {
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setSheetError(
        `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`,
      );
      return;
    }
    if (newPassword !== repeatPassword) {
      setSheetError("Die beiden neuen Passwörter stimmen nicht überein.");
      return;
    }

    const error = await request(
      "/api/account/password",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          revokeOtherSessions: revokeOthers,
        }),
      },
      "Konnte das Passwort nicht ändern.",
    );
    if (error) {
      setSheetError(error);
      return;
    }

    toast.success(
      revokeOthers
        ? "Passwort geändert · andere Geräte abgemeldet"
        : "Passwort geändert",
    );
    closeSheet();
    // Mit "andere Geräte abmelden" ist auch die eigene Sitzung eine neue --
    // und die Push-Anmeldung dieses Geräts hing an der alten.
    if (revokeOthers) await rebindPush();
    await loadSessions().catch(() => {
      toast.error("Konnte die Geräteliste nicht neu laden.");
    });
  }

  /**
   * Die Push-Anmeldung dieses Geräts wieder an die aktuelle Sitzung binden.
   *
   * Nötig nach jedem Rauswurf: die Route räumt dabei auch die Anmeldungen ohne
   * Sitzung weg (siehe dropUnboundPushSubscriptions), und ein Passwortwechsel
   * mit Rauswurf tauscht obendrein die eigene Sitzung aus. Weil beides über
   * eine eigene Route läuft und nicht über authClient, merkt <PushSync /> davon
   * nichts -- ohne diesen Aufruf bliebe das Gerät bis zum nächsten Neuladen
   * stumm. Scheitert es, sagen wir es: eine stille Erinnerung, die nie kommt,
   * fällt sonst erst auf, wenn etwas verdorben ist.
   */
  async function rebindPush() {
    try {
      await syncPushSubscription();
    } catch {
      toast.warning(
        "Erinnerungen auf diesem Gerät konnten nicht neu angemeldet werden.",
      );
    }
  }

  async function revokeSession(id: string) {
    const error = await request(
      `/api/account/sessions/${id}`,
      { method: "DELETE" },
      "Konnte das Gerät nicht abmelden.",
    );
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Gerät abgemeldet");
    await rebindPush();
    await loadSessions().catch(() => {
      toast.error("Konnte die Geräteliste nicht neu laden.");
    });
  }

  async function revokeOtherSessions() {
    const error = await request(
      "/api/account/sessions",
      { method: "DELETE" },
      "Konnte die anderen Geräte nicht abmelden.",
    );
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Alle anderen Geräte abgemeldet");
    await rebindPush();
    await loadSessions().catch(() => {
      toast.error("Konnte die Geräteliste nicht neu laden.");
    });
  }

  async function handleSignOut() {
    // Vor dem Abmelden, solange die Session den Löschaufruf noch autorisiert:
    // sonst blieben die Erinnerungen dieses Kontos auf dem Gerät stehen.
    setSigningOut(true);
    const pushRemoved = await unsubscribeFromPush();
    if (!pushRemoved) {
      toast.warning(
        "Benachrichtigungen konnten nicht vollständig abgemeldet werden.",
      );
    }
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  if (loading) {
    return (
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-[92px] animate-pulse rounded-[30px] bg-muted"
          />
        ))}
      </div>
    );
  }

  // Ohne Kontodaten gibt es nichts zu bedienen -- und ein weiterlaufendes
  // Skelett behauptete, es kaeme noch etwas.
  if (!account) {
    return (
      <p className="rounded-lg bg-danger-tint px-4 py-3 text-[13px] leading-relaxed font-medium text-danger">
        Die Kontodaten konnten nicht geladen werden. Bitte die Seite neu laden.
      </p>
    );
  }

  const otherSessions = sessions.filter((entry) => !entry.current);
  const now = new Date();

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h2 className={sectionTitleClass}>Profil</h2>
        <div className={cardClass}>
          <button
            type="button"
            onClick={() => {
              setNameDraft(account.name);
              openSheetFor("name");
            }}
            className={cn(rowClass, "w-full border-b border-hairline text-left")}
          >
            <span className="min-w-0 flex-1 text-[15px] font-semibold">Name</span>
            <span className="max-w-[9.5rem] shrink-0 truncate text-[13px] font-medium text-muted-foreground">
              {account.name}
            </span>
            <ChevronRight className="size-4 shrink-0 text-faint" strokeWidth={2} />
          </button>

          {account.hasPassword ? (
            <button
              type="button"
              onClick={() => {
                setEmailDraft(account.email);
                openSheetFor("email");
              }}
              className={cn(rowClass, "w-full text-left")}
            >
              <span className="min-w-0 flex-1 text-[15px] font-semibold">
                E-Mail
              </span>
              <span className="max-w-[9.5rem] shrink-0 truncate text-[13px] font-medium text-muted-foreground">
                {account.email}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-faint"
                strokeWidth={2}
              />
            </button>
          ) : (
            <div className={rowClass}>
              <span className="min-w-0 flex-1 text-[15px] font-semibold">
                E-Mail
              </span>
              <span className="max-w-[11rem] shrink-0 truncate text-[13px] font-medium text-muted-foreground">
                {account.email}
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={sectionTitleClass}>Anmeldung</h2>
        {account.hasPassword ? (
          <div className={cardClass}>
            <button
              type="button"
              onClick={() => openSheetFor("password")}
              className={cn(rowClass, "w-full text-left")}
            >
              <span className="min-w-0 flex-1 text-[15px] font-semibold">
                Passwort ändern
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-faint"
                strokeWidth={2}
              />
            </button>
          </div>
        ) : (
          // Kein Passwort, keine leeren Felder: bei SSO liegen E-Mail und
          // Passwort beim Anmeldedienst, und ein ausgegrauter Knopf hier
          // würde etwas versprechen, das dieser Server nicht halten kann.
          <div className={cn(cardClass, "flex items-center gap-3.5 p-3.5")}>
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
              <ShieldCheck className="size-5.5" strokeWidth={1.8} />
            </span>
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed font-medium text-balance text-muted-foreground">
              Anmeldung über {account.ssoName}. E-Mail-Adresse und Passwort
              werden dort verwaltet.
            </p>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={sectionTitleClass}>Geräte</h2>
        <div className={cardClass}>
          {sessions.map((entry, index) => {
            const Icon = DEVICE_ICONS[entry.kind];
            return (
              <div
                key={entry.id}
                className={cn(
                  rowClass,
                  index < sessions.length - 1 && "border-b border-hairline",
                )}
              >
                <span
                  className={cn(
                    "flex size-9.5 shrink-0 items-center justify-center rounded-lg",
                    entry.current
                      ? "bg-primary-tint text-primary"
                      : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  <Icon className="size-5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">
                    {entry.browser
                      ? `${entry.device} · ${entry.browser}`
                      : entry.device}
                  </span>
                  <span className="mt-0.5 block truncate text-[12.5px] leading-snug font-medium text-muted-foreground">
                    {[
                      entry.ipAddress,
                      // Erst im Client: eine aus new Date() abgeleitete
                      // Angabe bricht sonst den Prerender ab.
                      isClient
                        ? signedInLabel(new Date(entry.signedInAt), now)
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {entry.current ? (
                  <span className="inline-flex h-6.5 shrink-0 items-center rounded-full bg-primary-tint px-2.5 text-[11.5px] font-bold text-primary">
                    Dieses Gerät
                  </span>
                ) : (
                  <ConfirmDialog
                    trigger={
                      <Button
                        size="icon"
                        variant="ghost"
                        className="shrink-0 rounded-full"
                        disabled={busy}
                        aria-label={`${entry.device} abmelden`}
                      >
                        <X className="size-4" />
                      </Button>
                    }
                    icon={LogOut}
                    title="Gerät abmelden?"
                    description={`„${entry.browser ? `${entry.device} · ${entry.browser}` : entry.device}“ wird sofort abgemeldet und bekommt keine Erinnerungen mehr.`}
                    confirmLabel="Abmelden"
                    onConfirm={() => revokeSession(entry.id)}
                  />
                )}
              </div>
            );
          })}
        </div>

        <p className="px-1 pt-0.5 text-[12.5px] leading-relaxed font-medium text-balance text-muted-foreground">
          Jede Anmeldung läuft nach sieben Tagen ohne Nutzung von selbst aus.
        </p>

        {otherSessions.length > 0 && (
          <ConfirmDialog
            trigger={
              <button
                type="button"
                disabled={busy}
                className={cn(secondaryButtonClass, "mt-0.5")}
              >
                Alle anderen abmelden
              </button>
            }
            icon={LogOut}
            title="Alle anderen Geräte abmelden?"
            description={`${otherSessions.length} ${otherSessions.length === 1 ? "weiteres Gerät wird" : "weitere Geräte werden"} sofort abgemeldet. Dieses Gerät bleibt angemeldet.`}
            confirmLabel="Abmelden"
            onConfirm={revokeOtherSessions}
          />
        )}
      </section>

      {/* Gefuellt statt in Kartenfarbe: direkt darueber steht womoeglich
          "Alle anderen abmelden", und zwei gleich aussehende Knoepfe
          untereinander waeren am Daumen nicht zu unterscheiden. */}
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="h-12 w-full rounded-lg bg-surface-2 font-heading text-sm font-semibold shadow-row disabled:opacity-50"
      >
        {signingOut ? "Abmelden…" : "Abmelden"}
      </button>

      <Sheet
        open={openSheet === "name"}
        onOpenChange={(open) => !open && closeSheet()}
        title="Name ändern"
      >
        <form
          className="flex flex-col gap-3 px-1.5 pb-1"
          onSubmit={(event) => {
            event.preventDefault();
            void saveName();
          }}
        >
          <input
            name="name"
            autoComplete="name"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            placeholder="Dein Name"
            aria-label="Name"
            autoFocus
            className={fieldClass}
          />
          <SheetError message={sheetError} />
          <Button type="submit" disabled={busy} className="h-13 w-full text-[15px] disabled:opacity-60">
            {busy ? "Speichern…" : "Speichern"}
          </Button>
        </form>
      </Sheet>

      <Sheet
        open={openSheet === "email"}
        onOpenChange={(open) => !open && closeSheet()}
        title="E-Mail ändern"
      >
        <form
          className="flex flex-col gap-3 px-1.5 pb-1"
          onSubmit={(event) => {
            event.preventDefault();
            void saveEmail();
          }}
        >
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={emailDraft}
            onChange={(event) => setEmailDraft(event.target.value)}
            placeholder="neue@adresse.de"
            aria-label="Neue E-Mail-Adresse"
            autoFocus
            className={fieldClass}
          />
          <input
            type="password"
            name="current-password"
            autoComplete="current-password"
            value={emailPassword}
            onChange={(event) => setEmailPassword(event.target.value)}
            placeholder="Aktuelles Passwort"
            aria-label="Aktuelles Passwort"
            className={fieldClass}
          />
          <p className="px-1 text-[12.5px] leading-relaxed font-medium text-balance text-muted-foreground">
            Ab sofort meldest du dich mit der neuen Adresse an.
          </p>
          <SheetError message={sheetError} />
          <Button type="submit" disabled={busy} className="h-13 w-full text-[15px] disabled:opacity-60">
            {busy ? "Ändern…" : "E-Mail ändern"}
          </Button>
        </form>
      </Sheet>

      <Sheet
        open={openSheet === "password"}
        onOpenChange={(open) => !open && closeSheet()}
        title="Passwort ändern"
      >
        <form
          className="flex flex-col gap-3 px-1.5 pb-1"
          onSubmit={(event) => {
            event.preventDefault();
            void savePassword();
          }}
        >
          <input
            type="password"
            name="current-password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            placeholder="Aktuelles Passwort"
            aria-label="Aktuelles Passwort"
            autoFocus
            className={fieldClass}
          />
          <input
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder={`Neues Passwort (mind. ${MIN_PASSWORD_LENGTH} Zeichen)`}
            aria-label="Neues Passwort"
            className={fieldClass}
          />
          <input
            type="password"
            name="new-password-repeat"
            autoComplete="new-password"
            value={repeatPassword}
            onChange={(event) => setRepeatPassword(event.target.value)}
            placeholder="Neues Passwort wiederholen"
            aria-label="Neues Passwort wiederholen"
            className={fieldClass}
          />
          <div className="flex items-center gap-3 rounded-lg bg-surface-2 px-3.5 py-3 shadow-row">
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-semibold">
                Andere Geräte abmelden
              </span>
              <span className="mt-0.5 block text-[12.5px] leading-snug font-medium text-muted-foreground">
                Alle übrigen Anmeldungen enden sofort
              </span>
            </span>
            <Switch
              checked={revokeOthers}
              onCheckedChange={setRevokeOthers}
              aria-label="Andere Geräte abmelden"
            />
          </div>
          <SheetError message={sheetError} />
          <Button type="submit" disabled={busy} className="h-13 w-full text-[15px] disabled:opacity-60">
            {busy ? "Ändern…" : "Passwort ändern"}
          </Button>
        </form>
      </Sheet>
    </div>
  );
}

/**
 * "Angemeldet vor 3 Stunden" bzw. "Angemeldet am 12.08.2026".
 *
 * Bewusst der Zeitpunkt der Anmeldung und nicht die letzte Aktivität: die
 * Sitzungszeile wird nur einmal am Tag angefasst, "zuletzt aktiv" wäre bis zu
 * 24 Stunden daneben. Wann sich ein Gerät angemeldet hat, steht dagegen fest --
 * und genau das ist die Frage, mit der jemand diese Liste öffnet.
 */
function signedInLabel(date: Date, now: Date): string {
  const relative = formatRelativePast(date, now);
  return /^\d/.test(relative)
    ? `Angemeldet am ${relative}`
    : `Angemeldet ${relative}`;
}

/**
 * Die Antwort auf einen fehlgeschlagenen Versuch, dort wo die Eingabe steht.
 * Dieselbe Form wie der Berechtigungs-Hinweis in den Erinnerungen -- role
 * "alert", damit ein Screenreader sie ohne erneutes Antippen vorliest.
 */
function SheetError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p
      role="alert"
      className="rounded-lg bg-danger-tint px-3.5 py-2.5 text-[13px] leading-relaxed font-medium text-balance text-danger"
    >
      {message}
    </p>
  );
}
