"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  BookUp,
  Check,
  ChevronDown,
  CookingPot,
  ExternalLink,
  Loader2,
  ShoppingBasket,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { useIsClient } from "@/lib/use-is-client";
import { formatRelativeFuture, formatRelativePast } from "@/lib/relative-time";
import { STATUS_CLASSES } from "@/lib/expiry";
import { cn, normalizeProductName } from "@/lib/utils";
import type { Recipe, RecipeBudget, SuggestionView } from "@/lib/recipes/types";

/**
 * Rezeptvorschläge: der Knopf, der sie erzeugt, und die Historie darunter.
 *
 * Eine eigene Komponente und kein Seiten-Code, weil die Demo unter /demo
 * genau diese rendert -- mit erfundenen Daten und ohne Knopf-Funktion. Eine
 * nachgebaute Zweitfassung dort wäre nach dem ersten Umbau dieser Datei eine
 * Werbung für eine Ansicht, die es nicht mehr gibt.
 *
 * `configured`, `hasItems` und `initialBudget` kommen vom Server: die Seite
 * soll nicht erst nach einer fehlgeschlagenen Anfrage wissen, dass es nichts
 * zu holen gibt.
 *
 * `mealieEnabled` ist derselbe Gedanke für den Export-Knopf in der einzelnen
 * Karte: ohne MEALIE_URL und MEALIE_TOKEN gibt es kein Ziel, und ein Knopf,
 * der nur 503 sagen kann, ist schlechter als keiner. Anders als `configured`
 * schaltet er nichts ab, was schon dasteht -- er fügt nur etwas hinzu.
 *
 * Als einziger der vier hat er einen Vorgabewert, und zwar "aus": Der Knopf
 * schriebe in den Mealie-Server des Betreibers, und die Route dahinter
 * verlangt ohnehin eine Sitzung. Wer diese Komponente irgendwo ohne
 * angemeldeten Server einbaut -- /demo ist der bestehende Fall -- bekommt
 * damit von selbst die richtige Seite, statt sie jedes Mal ausdrücklich
 * abwählen zu müssen.
 */
export function RecipeSuggestions({
  initialSuggestions,
  configured,
  hasItems,
  initialBudget,
  mealieEnabled = false,
}: {
  initialSuggestions: SuggestionView[];
  configured: boolean;
  hasItems: boolean;
  initialBudget: RecipeBudget;
  mealieEnabled?: boolean;
}) {
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [busy, setBusy] = useState(false);
  const [budget, setBudget] = useState(initialBudget);
  const [asking, setAsking] = useState(false);

  /**
   * Welche Stapel offen stehen. Beim Laden genau der neueste.
   *
   * Die Historie wächst mit jedem Knopfdruck, und offen sind alle drei
   * Karten eines Stapels gut zwei Bildschirme hoch -- nach dem fünften
   * Vorschlag findet niemand mehr, was gerade dazugekommen ist. Kein
   * Akkordeon: mehrere Stapel dürfen offen stehen, wer zwei Vorschläge
   * vergleichen will, soll das können. Nur beim Erzeugen wird aufgeräumt
   * (siehe generate).
   */
  const [openIds, setOpenIds] = useState<Set<number>>(
    () => new Set(initialSuggestions.slice(0, 1).map((entry) => entry.id)),
  );

  // Stabil ueber useCallback, damit das memo an SuggestionBatch etwas nuetzt:
  // eine frisch gebaute Funktion je Rendern waere eine neue Prop und liesse
  // jeden Stapel neu rendern, sobald hier irgendein Zustand umspringt.
  const toggle = useCallback((id: number) => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);

  // Alles Datumsabhängige erst im Client: new Date() im Server-Render bricht
  // den Prerender der Route ab (siehe useIsClient).
  const isClient = useIsClient();
  const now = useMemo(() => (isClient ? new Date() : null), [isClient]);

  async function generate(override = false) {
    setBusy(true);
    try {
      const res = await fetch("/api/recipes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ override }),
      });
      const data = (await res.json().catch(() => null)) as {
        suggestion?: SuggestionView;
        error?: string;
        budget?: RecipeBudget;
      } | null;

      // Auch im Fehlerfall: Wenn die Route absagt, weil das Budget leer ist,
      // schickt sie es mit -- und die Anzeige unter dem Knopf stimmt danach
      // wieder, ohne dass jemand neu laden muss.
      if (data?.budget) setBudget(data.budget);

      if (!res.ok || !data?.suggestion) {
        // Der Text kommt aus der Route: sie unterscheidet aufgebrauchtes
        // Kontingent, Zeitüberschreitung und unbrauchbare Antwort, und jeder
        // Fall hat dort seinen eigenen Satz.
        toast.error(
          data?.error ?? "Es konnten keine Rezepte vorgeschlagen werden.",
        );
        return;
      }

      setSuggestions((current) => [data.suggestion!, ...current]);
      // Der frische Stapel steht offen, alles davor klappt zu -- genau die
      // Unterscheidung, um die es beim Zuklappen geht: was ist neu, was war
      // schon da.
      setOpenIds(new Set([data.suggestion.id]));
      toast.success("Rezepte vorgeschlagen");
    } catch {
      toast.error("Es konnten keine Rezepte vorgeschlagen werden.");
    } finally {
      setBusy(false);
    }
  }

  // Wie viele Vorschläge diese Liste noch erzeugen darf. Der kleinere der
  // beiden Werte zählt: Ein Tagesbudget von 14 hilft nicht, wenn die Stunde
  // voll ist.
  const left = Math.min(budget.hourLeft, budget.dayLeft);
  // Die Notbremse. Ist auch die erreicht, hilft keine Bestätigung mehr -- und
  // dann ist der Knopf wirklich aus, nicht nur ungewöhnlich. Der Ausnahmeweg
  // steht nur offen, solange sie nicht gezogen ist; sonst verspräche ein
  // "Trotzdem vorschlagen" etwas, das die Zeile darunter im selben Atemzug
  // verneint. Beides entscheidet getRecipeBudget und nicht diese Datei: Die
  // Regel stand vorher hier, in der Route und in der Demo je einmal.
  const blocked = budget.state === "blocked";
  const canOverride = budget.state === "needsOverride";
  const freeAt = budget[blocked ? "hardFreeAt" : "freeAt"];
  const freeIn =
    freeAt && now ? formatRelativeFuture(new Date(freeAt), now) : null;

  /**
   * Der Satz unter dem Knopf -- vier Lagen, vier Rückgaben.
   *
   * Als Funktion mit frühen Rückgaben und nicht als verschachtelter
   * Ternäroperator: Der stand vierfach ineinander und trug in zwei seiner
   * Zweige noch einen fünften für `freeIn`, war also nur noch als Ganzes zu
   * lesen.
   */
  function hint(): string {
    if (!hasItems) {
      return "Dein Vorrat ist leer. Trag zuerst etwas ein, dann gibt es auch etwas zu kochen.";
    }
    if (blocked) {
      return `Für heute ist Schluss – ${freeIn ? `${freeIn} geht es weiter.` : "gleich geht es weiter."}`;
    }
    if (canOverride) {
      return `Dein Kontingent ist aufgebraucht${freeIn ? ` und füllt sich ${freeIn} wieder` : ""} – weiter geht es nur auf eigene Verantwortung.`;
    }
    return `Verwendet AI (Google Gemini) - Noch ${left} ${left === 1 ? "Vorschlag" : "Vorschläge"} frei.`;
  }

  // Ohne Schlüssel gibt es nichts zu bedienen -- aber sehr wohl etwas zu
  // lesen: was einmal erzeugt wurde, ist bezahlt und bleibt stehen. Nur der
  // Knopf weicht dem Hinweis, warum gerade nichts Neues dazukommt.
  const controls = configured ? (
    <div className="flex flex-col gap-2 px-5">
      {/* Jenseits der Grenze ein ruhigerer Knopf: Die Grenze soll etwas
          bedeuten. Sähe der Weg darüber hinaus genauso aus wie der normale,
          wäre sie Zierde -- also verliert er die Füllung und behält nur den
          Umriss. Aus ist er trotzdem nicht, denn wer abends Gäste hat, soll
          den sechsten Vorschlag bekommen und nicht auf eine Uhr warten, die
          wir uns selbst ausgedacht haben. */}
      <Button
        variant={canOverride ? "outline" : "default"}
        onClick={() => setAsking(true)}
        disabled={busy || !hasItems || blocked}
        className="relative h-13 w-full overflow-hidden rounded-[18px] text-[15px]"
      >
        {/* Das Glanzband läuft nur, solange gefragt wird -- dasselbe wie über
            der Monatsspur im Archiv. Ein Modellaufruf dauert je nach Kette
            mehrere Sekunden, und in dieser Zeit war der drehende Kreis das
            einzige, was sich auf der ganzen Seite bewegte: Ein Spinner sagt
            "es hängt noch nicht", ein Band über die volle Breite sagt "hier
            passiert gerade etwas". Innerhalb des Knopfes und nicht darüber,
            damit overflow-hidden es an dessen Radius abschneidet. */}
        {busy && (
          <span
            aria-hidden
            className="sheen-band pointer-events-none absolute inset-y-0 w-[45%] animate-sheen"
          />
        )}
        {busy ? (
          <>
            <Loader2 className="size-4.5 animate-spin" />
            Rezepte werden gesucht …
          </>
        ) : canOverride ? (
          <>
            <TriangleAlert className="size-4.5" strokeWidth={2.2} />
            Trotzdem vorschlagen
          </>
        ) : (
          <>
            <Sparkles className="size-4.5" strokeWidth={2.2} />
            {suggestions.length > 0 ? "Neu vorschlagen" : "Rezepte vorschlagen"}
          </>
        )}
      </Button>

      {/* Überhaupt eine Rückfrage, weil ein Tipp auf den Knopf Vorratsdaten an
          einen fremden Dienst schickt und Kontingent verbraucht: Der Daumen
          trifft ihn auf dem Telefon leicht im Vorbeiscrollen, und rückgängig
          macht das niemand.

          Zwei Fragen und nicht eine mit Zusatz. Die gewöhnliche nennt, was das
          Haus verlässt, und steht in der Primärfarbe -- hier geht nichts
          kaputt, es passiert nur etwas, das Daten und Kontingent kostet. Die
          jenseits der Grenze nennt, was schiefgehen kann, steht in Gelb und
          lässt sich ohne Haken nicht wegtippen: Sie betrifft nicht mehr nur
          den, der drückt, sondern jeden auf diesem Server. Ein einziger
          Dialog, der seinen Ton je nach Lage wechselt, wäre kürzer -- und
          würde beide Fragen halb stellen. */}
      {canOverride ? (
        <ConfirmDialog
          open={asking}
          onOpenChange={setAsking}
          icon={TriangleAlert}
          tone="warning"
          title="Über die Grenze hinaus?"
          description={
            <>
              Dein Kontingent ist für den Moment aufgebraucht. Du kannst jetzt
              weitermachen{freeIn ? `, statt ${freeIn}` : ""} – das geht dann
              auf das Kontingent des Schlüssels, den dieser Server benutzt.
            </>
          }
          acknowledge={
            <>
              Mir ist bewusst: Ist das Kontingent bei Google aufgebraucht,
              funktionieren Rezepte für alle auf diesem Server nicht mehr, bis
              es zurückgesetzt wird – das kann bis zum nächsten Tag dauern.
            </>
          }
          confirmLabel="Verstanden, trotzdem suchen"
          onConfirm={() => generate(true)}
        />
      ) : (
        <ConfirmDialog
          open={asking}
          onOpenChange={setAsking}
          icon={Sparkles}
          tone="primary"
          title="Neue Rezepte suchen?"
          description="Für diese Funktion müssen wir einige deiner Artikel an Google Gemini AI Modelle schicken."
          confirmLabel="Ja, Rezepte suchen"
          onConfirm={() => generate()}
        />
      )}

      {/* Dass der Vorrat das Haus verlässt, gehört an die Stelle, an der die
          Entscheidung fällt -- nicht allein in die README. Und wie viel noch
          geht, gehört daneben: Eine Grenze, die man erst als Fehlermeldung
          kennenlernt, fühlt sich wie eine Störung an; eine, die vorher
          dasteht, wie eine Regel. */}
      <p className="px-1 text-[12.5px] leading-snug font-medium text-muted-foreground">
        {hint()}
      </p>
    </div>
  ) : suggestions.length > 0 ? (
    <p className="mx-5 rounded-[20px] bg-surface-2 p-3.5 text-[13px] leading-snug font-medium text-muted-foreground">
      Neue Vorschläge gehen gerade nicht – dieser Server hat keinen Zugang zum
      Rezeptdienst. Die bisherigen bleiben hier stehen.
    </p>
  ) : (
    <div className="px-5">
      <EmptyState
        icon={CookingPot}
        variant="card"
        title="Rezepte sind nicht eingerichtet"
        body="Dieser Server hat keinen Zugang zum Rezeptdienst. Wer ihn betreibt, findet die nötigen Schritte in der README unter „Rezeptvorschläge“."
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-5">
      {controls}

      {suggestions.length === 0
        ? configured && (
            <div className="px-5">
              <EmptyState
                icon="mascot"
                variant="card"
                title="Noch keine Vorschläge"
                body="Ein Tipp auf den Knopf, und hier stehen drei Gerichte aus dem, was als Nächstes weg muss."
              />
            </div>
          )
        : suggestions.map((suggestion) => (
            <SuggestionBatch
              key={suggestion.id}
              suggestion={suggestion}
              now={now}
              open={openIds.has(suggestion.id)}
              onToggle={toggle}
              mealieEnabled={mealieEnabled}
            />
          ))}
    </div>
  );
}

/**
 * Grundform jeder Pille -- an drei Stellen dieselbe Größe, damit die
 * Vorratsliste über dem Stapel und die Zutatenpillen in den Karten als eine
 * Sprache gelesen werden. Nur die Farbe unterscheidet die Rollen.
 */
const PILL =
  "flex items-center gap-1 rounded-full px-2.5 py-1 font-heading text-[11.5px] leading-tight font-bold";

/**
 * Der Mealie-Knopf in der Titelfläche -- als Karte auf der getönten Fläche.
 *
 * Dieselbe Größe und Schrift wie PILL darunter, damit die Kopfzeile nicht mit
 * einer dritten Formensprache anfängt; der Unterschied ist bewusst nur die
 * Farbe der Fläche. `bg-card` statt einer weiteren Tönung, weil ein Element,
 * das man antippen kann, sich von den Pillen unterscheiden muss, die man nur
 * liest -- die Karte hebt sich vom primary-tint des Bandes ab, ohne eine
 * eigene Farbe zu erfinden.
 *
 * Knopf und Link teilen sie sich: Nach dem Export steht an derselben Stelle
 * ein <a>, und der darf nicht plötzlich anders aussehen oder springen.
 */
const BADGE_BUTTON =
  "flex h-7.5 items-center gap-1.5 rounded-full bg-card px-2.5 font-heading text-[11.5px] leading-none font-bold text-primary-deep shadow-row outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Wie weit der Export eines einzelnen Gerichts ist.
 *
 * Ein Feld und nicht zwei (`sending` neben `exportedUrl`): Die Karte liest
 * genau diese drei Fälle, und "wird gerade gesendet und liegt schon in
 * Mealie" ist keiner davon. Als zwei Booleans wäre er trotzdem darstellbar
 * gewesen, und jede spätere Änderung müsste zwei Setter über
 * try/return/catch hinweg im Gleichschritt halten -- ein vergessener
 * `setSending(false)` hinterlässt einen dauerhaft toten Knopf.
 */
type ExportState = { kind: "idle" } | { kind: "sending" } | { kind: "done"; url: string };

const EXPORT_IDLE: ExportState = { kind: "idle" };

/**
 * Ein Artikelname, so weit vereinheitlicht, dass zwei Schreibweisen desselben
 * Artikels zusammenfinden.
 *
 * Der angehängte Klammerausdruck ist kein erfundener Fall: das Modell bekommt
 * Name und Kategorie in einer Zeile und schrieb in einer früheren Fassung
 * "Hackfleisch gemischt (Fleisch & Fisch)" in 'uses' zurück. Der Prompt
 * verhindert das inzwischen (siehe buildPrompt), aber die Karte liest auch
 * Stapel, die vor dieser Korrektur entstanden sind -- und ein Vorschlag, der
 * deswegen die falsche Farbe trägt, behauptet, er rette nichts.
 *
 * Der Rest ist normalizeProductName() aus lib/utils.ts -- dieselbe Form, in
 * der auch das Zusammenlegen zweier Artikel vergleicht (findMergeTarget in
 * lib/item-merge.ts). Eine eigene Fassung hier war schon einmal eine zu viel:
 * ihr fehlte das Zusammenziehen doppelter Leerzeichen, sodass "Gouda  am
 * Stück" beim Zusammenlegen als derselbe Artikel galt, in der Rezeptkarte
 * aber nicht.
 */
function normalizeName(value: string): string {
  return normalizeProductName(value.replace(/\s*\([^)]*\)\s*$/, ""));
}

/**
 * Ein Stapel: wann er entstand, woraus -- und die Gerichte.
 *
 * Zugeklappt bleibt die Kopfzeile stehen, und die traegt beides, was zum
 * Wiederfinden noetig ist: wann und wie viele. Aufgeklappt kommen die
 * Artikel dazu, aus denen ausgewaehlt wurde -- die blosse Zahl ("aus 9
 * Artikeln") beantwortet die Frage "woraus" naemlich nicht, und fuer die
 * Kopfzeile eines geschlossenen Stapels ist sie zu viel.
 */
const SuggestionBatch = memo(function SuggestionBatch({
  suggestion,
  now,
  open,
  onToggle,
  mealieEnabled,
}: {
  suggestion: SuggestionView;
  now: Date | null;
  open: boolean;
  onToggle: (id: number) => void;
  mealieEnabled: boolean;
}) {
  const count = suggestion.recipes.length;

  /**
   * Was aus diesem Stapel schon nach Mealie gegangen ist, je Position.
   *
   * Der Zustand liegt hier und nicht in der Karte, die ihn anzeigt, und das
   * ist der ganze Punkt: RecipeCard entsteht erst beim Aufklappen (siehe das
   * `open &&` unten) und wird beim Zuklappen wieder ausgehängt. Lag der
   * Vermerk dort, kam der Knopf nach Zuklappen und Wiederaufklappen frisch
   * zurück, obwohl das Rezept längst in Mealie stand -- und der nächste Druck
   * legte dort ein zweites, gleiches an. Der Stapel selbst bleibt über beides
   * hinweg stehen, hier überlebt der Vermerk es also.
   *
   * Nur im Speicher und nicht in der Datenbank: Ein "schon exportiert"-Vermerk
   * wäre eine Schemaspalte für eine Frage, die Mealie selbst besser
   * beantwortet -- dort steht das Rezept ja. Nach einem Neuladen ist der Knopf
   * daher wieder frisch; wer dann zweimal drückt, bekommt in Mealie ein
   * zweites Rezept statt eines Fehlers, weil Mealie den Slug von sich aus
   * durchnummeriert.
   */
  const [exports, setExports] = useState<Map<number, ExportState>>(() => new Map());

  /**
   * Ein Gericht dieses Stapels nach Mealie schicken.
   *
   * Verschickt werden die Stapel-ID und die Position, nie das Rezept selbst:
   * Was Mealie erreicht, liest die Route aus der gespeicherten Zeile (siehe
   * getSuggestedRecipe). Der Browser sagt also, welches Gericht gemeint ist,
   * nicht was darin steht.
   */
  async function exportToMealie(index: number) {
    const mark = (state: ExportState) =>
      setExports((current) => new Map(current).set(index, state));

    mark({ kind: "sending" });
    try {
      const res = await fetch("/api/recipes/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionId: suggestion.id, index }),
      });
      const data = (await res.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;

      if (!res.ok || !data?.url) {
        // Der Text kommt aus der Route: sie unterscheidet abgelehnten Token,
        // unerreichbaren Server und Zeitüberschreitung, und jeder Fall hat
        // dort seinen eigenen Satz.
        toast.error(data?.error ?? "Das Rezept konnte nicht übertragen werden.");
        mark(EXPORT_IDLE);
        return;
      }

      const url = data.url;
      mark({ kind: "done", url });
      toast.success("In Mealie gespeichert");
    } catch {
      toast.error("Das Rezept konnte nicht übertragen werden.");
      mark(EXPORT_IDLE);
    }
  }

  // Alles, was irgendein Gericht dieses Stapels tatsächlich aufbraucht.
  // Normalisiert, weil die Karten unten für dieselbe Zuordnung dasselbe tun --
  // ständen hier die Rohnamen, trüge ein Artikel in der Liste die Farbe
  // "ungenutzt" und in der Karte gleichzeitig die Farbe "dringend".
  const usedNames = useMemo(
    () =>
      new Set(
        suggestion.recipes.flatMap((recipe) =>
          recipe.uses.map((name) => normalizeName(name)),
        ),
      ),
    [suggestion.recipes],
  );

  // Einmal hier statt in jeder der drei Karten: Die Karten bekamen bisher
  // `basedOn` gereicht und bauten sich daraus jede für sich denselben Satz
  // dringender Namen -- dreimal dieselbe Schleife über dieselbe Liste, direkt
  // neben usedNames, das aus derselben Quelle stammt.
  const urgentNames = useMemo(
    () =>
      new Set(
        suggestion.basedOn
          .filter((entry) => entry.urgent)
          .map((entry) => normalizeName(entry.name)),
      ),
    [suggestion.basedOn],
  );

  return (
    <section className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2 px-5">
        {/* Der Knopf sitzt im h2 und nicht umgekehrt: ein <button> darf nur
            Text und Aehnliches enthalten, keine Ueberschrift. So bleibt die
            Gliederung fuer Screenreader erhalten, und aria-expanded sagt
            dort, was der Pfeil hier zeigt. */}
        <h2>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => onToggle(suggestion.id)}
            className="flex w-full items-center justify-between gap-3 rounded-[14px] px-1 py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="truncate font-heading text-[13px] leading-none font-bold text-muted-foreground">
              {now
                ? formatRelativePast(new Date(suggestion.createdAt), now)
                : "\u00a0"}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-faint">
              {count} {count === 1 ? "Rezept" : "Rezepte"}
              <ChevronDown
                className={cn(
                  "size-3.5 transition-transform",
                  open && "rotate-180",
                )}
                strokeWidth={2.4}
              />
            </span>
          </button>
        </h2>

        {/* Gelb sind die Artikel, die den Vorschlag ausgeloest haben --
            dieselbe Farbe, in der sie auch im Vorrat stehen --, ruhig der
            uebrige Vorrat, der nur zur Auswahl stand. Die Einteilung kommt
            aus der gespeicherten Zeile und nicht aus dem heutigen Datum: ein
            Stapel von letzter Woche soll zeigen, was damals dringend war.

            Die Ueberschrift ist nachgetragen, weil die blanke Reihe eine
            falsche Zusage gab: Sie sah aus wie "das steckt in den Rezepten",
            war aber immer schon "das stand zur Auswahl" -- und wer dann eine
            Flasche Mineralwasser darin fand, die in keinem der drei Gerichte
            vorkam, hatte recht mit seiner Verwunderung. Was kein Gericht
            gebraucht hat, tritt jetzt zusaetzlich zurueck. */}
        {open && suggestion.basedOn.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <h3 className="label-caps">Zur Auswahl gestellt</h3>
            <ul className="flex flex-wrap gap-1.5 px-1">
              {suggestion.basedOn.map((entry, index) => {
                const used = usedNames.has(normalizeName(entry.name));
                return (
                  <li
                    key={`${entry.name}-${index}`}
                    className={cn(
                      PILL,
                      entry.urgent
                        ? STATUS_CLASSES.soon.chip
                        : "bg-card text-muted-foreground",
                      // Blass allein waere fuer einen Screenreader gar nichts,
                      // deshalb steht dieselbe Aussage nebenan noch einmal als
                      // Text.
                      !used && "opacity-55",
                    )}
                  >
                    {entry.name}
                    {!used && (
                      <span className="sr-only"> (nicht verwendet)</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-3 px-5">
          {suggestion.recipes.map((recipe, index) => (
            <RecipeCard
              key={`${suggestion.id}-${index}`}
              recipe={recipe}
              urgentNames={urgentNames}
              recipeIndex={index}
              mealieEnabled={mealieEnabled}
              exportState={exports.get(index) ?? EXPORT_IDLE}
              onExport={() => exportToMealie(index)}
            />
          ))}
        </div>
      )}
    </section>
  );
});

/**
 * Eine Rezeptkarte.
 *
 * Die Titelfläche ist einheitlich getönt und trägt nur das Emoji. Sie war
 * eine Zeit lang gelb, sobald das Gericht etwas Ablaufendes aufbrauchte --
 * bis auffiel, dass die System-Instruktion genau das von jedem Gericht
 * verlangt: Das Gelb war praktisch immer an und sagte deshalb nichts. Die
 * Dringlichkeit steht jetzt dort, wo sie etwas unterscheidet, nämlich an der
 * einzelnen Zutat.
 */
function RecipeCard({
  recipe,
  urgentNames,
  recipeIndex,
  mealieEnabled,
  exportState,
  onExport,
}: {
  recipe: Recipe;
  /**
   * Welche Artikel dringend waren -- vom Stapel gereicht, weil er den Satz
   * ohnehin schon bildet. Er stammt aus der gespeicherten Zeile und nicht aus
   * dem heutigen Datum: eine Karte von letzter Woche würde sonst nachträglich
   * die Farbe wechseln, obwohl sich an dem, was sie zeigt, nichts geändert hat.
   */
  urgentNames: Set<string>;
  /** Nur für die gestaffelte Bewegung unten -- die Karte adressiert nichts. */
  recipeIndex: number;
  mealieEnabled: boolean;
  /**
   * Wie weit der Export ist, und was ihn auslöst -- beides vom Stapel.
   *
   * Diese Komponente hält davon nichts selbst, denn sie überlebt das
   * Zuklappen nicht (siehe `exports` in SuggestionBatch).
   */
  exportState: ExportState;
  onExport: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <article
      className="animate-slide-in overflow-hidden rounded-[24px] bg-card shadow-row"
      /* Der Versatz je Karte macht aus drei gleichzeitig auftauchenden
         Kacheln ein Nacheinander -- dieselbe Staffelung wie auf /saved, nur
         enger getaktet, weil hier drei Karten kommen und nicht drei
         Abschnitte. Als Inline-Style und nicht als [animation-delay:...]:
         Tailwind erzeugt seine Klassen beim Bauen aus dem Quelltext, und ein
         aus recipeIndex zusammengesetzter Klassenname stünde dort nirgends.
         Beim Aufklappen eines älteren Stapels läuft dieselbe Staffelung noch
         einmal -- die Karten werden dabei tatsächlich neu eingehängt, und
         genau dann ist die Bewegung auch gemeint. */
      style={{ animationDelay: `${recipeIndex * 70}ms` }}
    >
      <div className="relative flex h-22 items-center justify-center bg-primary-tint">
        {/* aria-hidden: das Emoji ist der Ersatz für ein Foto und trägt keine
            Bedeutung, die nicht im Titel darunter schon steht. Vorgelesen
            wäre es eine Unterbrechung ("Auflauf-Emoji") vor jeder Karte.

            Das Wippen ist dasselbe, mit dem Avo auf der Startseite steht: Die
            Fläche ist der Ersatz für ein Rezeptfoto und wäre sonst der einzige
            vollkommen ruhige Block der Seite. Dauer und Anlauf hängen am
            Index, damit die drei Emojis nicht im Gleichschritt auf und ab
            gehen -- drei synchron wippende Kacheln lesen sich als Fehler, drei
            leicht versetzte als Leben. Der Grund für den Inline-Style ist
            derselbe wie oben am <article>. */}
        <span
          className="animate-bob text-[46px] leading-none"
          style={{
            animationDuration: `${3.6 + recipeIndex * 0.45}s`,
            animationDelay: `${recipeIndex * 260}ms`,
          }}
          aria-hidden="true"
        >
          {recipe.emoji}
        </span>

        {/* Der Export sitzt in der Titelfläche und nicht unter der
            Zubereitung, wo er zuerst stand: Dort war er erst nach dem
            Aufklappen zu sehen, und wer ein Rezept übernehmen will, weiß das
            oft schon beim Überfliegen der Karte. Diese Fläche trägt bisher
            nur das Emoji -- der Knopf kostet hier also keine einzige Zeile
            Höhe, während er als eigene Zeile im Fuß jede der drei Karten
            eines Stapels länger gemacht hätte.

            Kurz beschriftet und nicht nur ein Symbol: Ein Pfeil-in-Kasten
            allein sagt niemandem, wohin er zeigt. Das aria-label trägt den
            ganzen Satz nach, weil "Mealie" ohne die umgebende Karte auch
            nicht mehr verrät als das Symbol.

            Keine Rückfrage wie beim Erzeugen: Das Ziel ist der eigene
            Mealie-Server des Haushalts, nicht ein fremder Dienst, es kostet
            kein Kontingent, und rückgängig macht man es dort mit einem
            Klick. */}
        {mealieEnabled && (
          <div className="absolute top-2.5 right-2.5">
            {exportState.kind === "done" ? (
              // Nach dem Übertragen führt derselbe Platz dorthin, wo das
              // Rezept jetzt liegt. Ein zweites Mal senden geht bewusst nicht
              // mehr: das wären zwei gleiche Rezepte in Mealie, und wer das
              // wirklich will, lädt die Seite neu. Zuklappen genügt dafür
              // nicht -- der Vermerk liegt im Stapel und überlebt es.
              //
              // animate-pop läuft dabei genau einmal und genau im richtigen
              // Moment, weil das <a> den Knopf erst ersetzt, wenn die Route
              // geantwortet hat. Die Bestätigung steht damit dort, wohin der
              // Finger ohnehin zeigt -- der Toast unten am Rand meldet
              // dasselbe, ist aber nicht die Stelle, die man gerade ansieht.
              <a
                href={exportState.url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(BADGE_BUTTON, "animate-pop")}
              >
                <Check className="size-3.5" strokeWidth={2.8} aria-hidden="true" />
                In Mealie
                <ExternalLink className="size-3" strokeWidth={2.4} aria-hidden="true" />
              </a>
            ) : (
              <button
                type="button"
                aria-label="Zu Mealie exportieren"
                onClick={onExport}
                disabled={exportState.kind === "sending"}
                className={cn(BADGE_BUTTON, "disabled:opacity-60")}
              >
                {exportState.kind === "sending" ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <BookUp className="size-3.5" strokeWidth={2.4} aria-hidden="true" />
                )}
                Mealie
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2.5 p-4">
        <div>
          <h3 className="font-heading text-[16px] leading-tight font-bold">
            {recipe.title}
          </h3>
          {recipe.description && (
            <p className="mt-1 text-[13px] leading-snug font-medium text-muted-foreground">
              {recipe.description}
            </p>
          )}
        </div>

        {/* Drei Farben in einer Zeile, und jede beantwortet eine andere
            Frage. Gelb: liegt im Vorrat und läuft ab -- deswegen steht dieses
            Gericht hier. Ruhig: liegt im Vorrat, hat Zeit. Aktionsfarbe mit
            Korb: fehlt und muss gekauft werden. Das ist die Unterscheidung,
            die darüber entscheidet, ob man heute Abend noch losfährt; ein
            gemeinsamer Topf aus "Zutaten" würde sie verstecken. Der Korb
            steht in jeder Pille und nicht einmal als Überschrift davor: die
            Zeile bricht um, und eine Überschrift wäre dann drei Pillen weit
            weg von dem, was sie erklärt. */}
        {(recipe.uses.length > 0 || recipe.buy.length > 0) && (
          <ul className="flex flex-wrap gap-1.5">
            {recipe.uses.map((name, index) => (
              <li
                key={`use-${name}-${index}`}
                className={cn(
                  PILL,
                  urgentNames.has(normalizeName(name))
                    ? STATUS_CLASSES.soon.chip
                    : "bg-surface-2 text-muted-foreground",
                )}
              >
                {name}
              </li>
            ))}
            {recipe.buy.map((name, index) => (
              <li
                key={`buy-${name}-${index}`}
                className={cn(PILL, "bg-primary-tint text-primary-deep")}
              >
                <ShoppingBasket
                  className="size-3 shrink-0"
                  strokeWidth={2.6}
                  aria-hidden="true"
                />
                <span className="sr-only">Noch zu kaufen: </span>
                {name}
              </li>
            ))}
          </ul>
        )}

        {/* aria-expanded statt nur eines Pfeils: die Fläche sagt damit auch
            ohne Blick, ob sie offen ist -- und /demo lässt genau solche
            Bedienelemente durch, weil sie nur die Ansicht umstellen. */}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className="-mx-1 -mb-1 flex items-center justify-between gap-2 rounded-[14px] px-1 py-1.5 text-left font-heading text-[13px] font-bold text-primary-deep outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {open ? "Weniger anzeigen" : "Zutaten und Zubereitung"}
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            strokeWidth={2.4}
          />
        </button>

        {open && (
          <div className="flex flex-col gap-3.5 border-t border-hairline pt-3.5">
            {recipe.ingredients.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h4 className="label-caps">Zutaten</h4>
                {/* pl-1 wie label-caps: die Utility bringt ihr eigenes
                    padding-left mit, ohne das hier steht die Liste um vier
                    Pixel neben ihrer Ueberschrift. */}
                <ul className="flex flex-col gap-1 pl-1">
                  {recipe.ingredients.map((ingredient, index) => (
                    <li
                      key={index}
                      className="text-[13px] leading-snug font-medium text-muted-foreground"
                    >
                      {ingredient}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {/* Nummeriert, weil Kochschritte tatsächlich eine Reihenfolge
                haben -- die Zutaten darüber haben keine und bekommen deshalb
                auch keine Nummern. */}
            <div className="flex flex-col gap-1.5">
              <h4 className="label-caps">Zubereitung</h4>
              <ol className="flex flex-col gap-2 pl-1">
                {recipe.steps.map((step, index) => (
                  <li key={index} className="flex gap-2.5">
                    <span className="mt-px flex size-5 shrink-0 items-center justify-center rounded-full bg-primary-tint font-heading text-[11px] font-bold text-primary-deep">
                      {index + 1}
                    </span>
                    <span className="text-[13px] leading-snug font-medium">
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
