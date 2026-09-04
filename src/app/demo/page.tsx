"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { HomeOverview } from "@/components/home-overview";
import { InventoryList } from "@/components/inventory-list";
import { RecipeSuggestions } from "@/components/recipe-suggestions";
import { Tab, TabBar } from "@/components/ui/chip";
import { Sheet } from "@/components/ui/sheet";
import { useIsClient } from "@/lib/use-is-client";
import { REVEAL_DISTANCE } from "@/lib/use-swipe-actions";
import {
  DEMO_CATEGORIES,
  DEMO_FOOTNOTE,
  DEMO_LIST_ID,
  DEMO_LISTS,
  DEMO_MONTHLY_GOAL,
  DEMO_PLACES,
  DEMO_RECIPE_BUDGET,
  DEMO_USER_NAME,
  buildDemoItems,
  buildDemoRecipeSuggestions,
  buildDemoResolvedEntries,
} from "@/lib/demo-data";

/**
 * Die Demo-Vorschau: Startseite und Vorrat mit einem erfundenen Haushalt,
 * ohne Konto erreichbar.
 *
 * Die einzige Seite der App ohne requireSession -- /demo steht deshalb in
 * PUBLIC_PREFIXES von proxy.ts. Sie darf das, weil sie nichts aus der
 * Datenbank liest: alles, was hier steht, kommt aus demo-data.ts und ist für
 * jeden Besucher dasselbe.
 *
 * Gerendert werden die echten Komponenten, HomeOverview und InventoryList,
 * nicht nachgebaute Zwillinge. Eine Demo, die eine Kopie zeigt, veraltet mit
 * dem ersten Umbau der Startseite und wirbt danach mit einer App, die es so
 * nicht mehr gibt.
 */
export default function DemoPage() {
  const [tab, setTab] = useState<"start" | "vorrat" | "rezepte">("start");
  const [hintOpen, setHintOpen] = useState(false);

  // Der Stichtag entsteht erst nach der Hydration: new Date() im Render
  // brächte unter cacheComponents:true den Prerender dieser Route zu Fall,
  // und der Server kennt ohnehin nur seine eigene Zeitzone. Genau dasselbe
  // Muster benutzen home-overview.tsx und inventory-list.tsx für ihre
  // Restlaufzeiten.
  const isClient = useIsClient();
  const today = useMemo(() => (isClient ? new Date() : null), [isClient]);

  // Stabil über Renders hinweg: HomeOverview und InventoryList vergleichen
  // initialItems per Referenz, um ihren optimistischen Zustand zurückzusetzen.
  // Ein bei jedem Render neu gebautes Array würde diesen Vergleich in jedem
  // Durchgang auslösen.
  const items = useMemo(() => (today ? buildDemoItems(today) : null), [today]);
  const resolvedEntries = useMemo(
    () => (today ? buildDemoResolvedEntries(today) : null),
    [today],
  );
  const recipeSuggestions = useMemo(
    () => (today ? buildDemoRecipeSuggestions(today) : null),
    [today],
  );

  return (
    <div className="flex flex-1 flex-col pb-4">
      <div className="flex flex-col gap-3.5 px-5 pt-2">
        <div className="flex items-center gap-2">
          <Link
            href="/welcome"
            aria-label="Zurück zur Einführung"
            className="flex size-9.5 shrink-0 items-center justify-center rounded-[13px] border border-border bg-card"
          >
            <ArrowLeft className="size-4.5" strokeWidth={2.2} />
          </Link>
          <span className="flex h-9.5 min-w-0 flex-1 items-center gap-1.5 rounded-[13px] bg-primary-tint px-3 text-[12.5px] font-bold text-primary">
            <Eye className="size-3.5 shrink-0" strokeWidth={2.4} />
            <span className="truncate">Demo – erfundener Vorrat, nur zum Ansehen</span>
          </span>
        </div>

        <TabBar>
          <Tab active={tab === "start"} onClick={() => setTab("start")}>
            Startseite
          </Tab>
          <Tab active={tab === "vorrat"} onClick={() => setTab("vorrat")}>
            Vorrat
          </Tab>
          <Tab active={tab === "rezepte"} onClick={() => setTab("rezepte")}>
            Rezepte
          </Tab>
        </TabBar>
      </div>

      <DemoSurface onBlocked={() => setHintOpen(true)}>
        {items === null || resolvedEntries === null || recipeSuggestions === null ? (
          <DemoFallback />
        ) : tab === "rezepte" ? (
          // Dieselbe Komponente wie unter /recipes, nur mit erfundenen Daten:
          // configured/hasItems stehen auf true, damit der Knopf so aussieht
          // wie im Betrieb. Anfassen laesst er sich trotzdem nicht --
          // DemoSurface faengt jeden Klick ab, der nicht bloss die Ansicht
          // umstellt, und das Aufklappen eines Rezepts (aria-expanded) ist
          // genau so einer.
          <div className="pt-4">
            <RecipeSuggestions
              initialSuggestions={recipeSuggestions}
              configured
              hasItems
              initialBudget={DEMO_RECIPE_BUDGET}
            />
          </div>
        ) : tab === "start" ? (
          <div className="pt-4">
            <HomeOverview
              initialItems={items}
              categories={DEMO_CATEGORIES}
              places={DEMO_PLACES}
              resolvedEntries={resolvedEntries}
              monthlyGoal={DEMO_MONTHLY_GOAL}
              lists={DEMO_LISTS}
              activeListId={DEMO_LIST_ID}
              userName={DEMO_USER_NAME}
            />
          </div>
        ) : (
          <InventoryList
            initialItems={items}
            categories={DEMO_CATEGORIES}
            places={DEMO_PLACES}
            lists={DEMO_LISTS}
            activeListId={DEMO_LIST_ID}
          />
        )}
      </DemoSurface>

      {/* Der Ausgang aus der Demo, immer sichtbar: ohne ihn endet die
          Vorschau in einer Sackgasse -- die Bottom-Nav erscheint ohne
          Sitzung bewusst nicht (siehe bottom-nav-gate.tsx). */}
      <div className="sticky bottom-0 mt-4 flex flex-col gap-2 border-t border-border bg-background/90 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-[20px]">
        <Link
          href="/register"
          className="flex h-13 items-center justify-center rounded-[18px] bg-primary text-[15px] font-bold text-primary-foreground"
        >
          Konto erstellen
        </Link>
        <p className="text-center text-[12px] font-semibold text-faint">
          {DEMO_FOOTNOTE}
        </p>
      </div>

      <Sheet open={hintOpen} onOpenChange={setHintOpen} title="Das geht nur mit Konto">
        <p className="px-1.5 text-[14.5px] leading-[1.55] font-medium text-muted-foreground">
          {DEMO_FOOTNOTE} Abhaken, Wischen und Hinzufügen ändern deinen Vorrat –
          und den gibt es erst, wenn du einen hast.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href="/register"
            className="flex h-13 items-center justify-center rounded-[18px] bg-primary text-[15px] font-bold text-primary-foreground"
          >
            Konto erstellen
          </Link>
          <button
            type="button"
            onClick={() => setHintOpen(false)}
            className="flex h-11 items-center justify-center text-sm font-semibold text-muted-foreground"
          >
            Weiter umsehen
          </button>
        </div>
      </Sheet>
    </div>
  );
}

/**
 * Der Riegel, der aus den echten Komponenten eine reine Vorschau macht.
 *
 * Er sitzt bewusst hier und nicht in HomeOverview, InventoryList oder ItemRow:
 * die drei sind die Vorlage für den angemeldeten Betrieb, und ein
 * "readOnly"-Schalter quer durch sie hindurch wäre eine Sonderregel in genau
 * den Dateien, die keine haben dürfen. Die Demo ist der Sonderfall, also
 * trägt die Demo den Sonderfall.
 *
 * Gearbeitet wird in der **Capture-Phase**: React verteilt Ereignisse vom
 * Wurzelknoten aus abwärts, ein stopPropagation() hier oben erreicht die
 * onClick-/onPointerDown-Handler weiter unten also gar nicht erst. Damit ist
 * der Riegel geschlossen statt offen -- nicht "diese eine Schaltfläche ist
 * gesperrt", sondern "durch kommt nur, was ausdrücklich harmlos ist". Jede
 * Schaltfläche, die eine spätere Runde in die beiden Screens einbaut, ist
 * damit von sich aus mitgesperrt.
 *
 * Durchgelassen wird, was allein die Ansicht umstellt und nichts schreibt:
 * die Filter-Segmente und Gruppierungs-Chips tragen aria-pressed (siehe
 * ui/chip.tsx), das Suchfeld ist ein input samt umschließendem label, und die
 * Abzeichen-Übersicht der Hero-Karte klappt über aria-expanded auf.
 *
 * Die Zeiger-Ereignisse werden vollständig abgefangen, weil die Wischgeste an
 * ihnen hängt (use-swipe-actions.ts). stopPropagation() nimmt der Zeile die
 * Geste, ohne preventDefault() zu rufen -- Scrollen, Fokussieren und
 * Textauswahl bleiben davon unberührt.
 */
function DemoSurface({
  onBlocked,
  children,
}: {
  onBlocked: () => void;
  children: React.ReactNode;
}) {
  const startX = useRef<number | null>(null);
  const hinted = useRef(false);

  return (
    <div
      className="flex flex-1 flex-col"
      onPointerDownCapture={(event) => {
        event.stopPropagation();
        startX.current = event.clientX;
        hinted.current = false;
      }}
      onPointerMoveCapture={(event) => {
        event.stopPropagation();
        // Sobald die Bewegung als Wischen zählt -- dieselbe Strecke, ab der
        // eine echte Zeile ihre Beschriftung zeigt. Der Hinweis kommt damit
        // im Zug der Geste und nicht erst beim Loslassen, wo der Nutzer sonst
        // gar nicht wüsste, worauf er ihn bezieht.
        if (hinted.current || startX.current === null) return;
        if (Math.abs(event.clientX - startX.current) <= REVEAL_DISTANCE) return;
        hinted.current = true;
        onBlocked();
      }}
      onPointerUpCapture={(event) => {
        event.stopPropagation();
        startX.current = null;
      }}
      onPointerCancelCapture={(event) => {
        event.stopPropagation();
        startX.current = null;
      }}
      onClickCapture={(event) => {
        if (isViewOnlyControl(event.target)) return;
        event.preventDefault();
        event.stopPropagation();
        onBlocked();
      }}
    >
      {children}
    </div>
  );
}

/** Bedienelemente, die nur die Ansicht umstellen -- siehe DemoSurface. */
function isViewOnlyControl(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest("[aria-pressed],[aria-expanded],input,label") !== null;
}

function DemoFallback() {
  return (
    <div className="flex flex-col gap-3.5 px-5 pt-4">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-muted" />
      <div className="h-45 animate-pulse rounded-[28px] bg-muted" />
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="h-15 animate-pulse rounded-[15px] bg-muted" />
      ))}
    </div>
  );
}
