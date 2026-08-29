import { Suspense } from "react";
import Link from "next/link";
import { Barcode, Camera, ClipboardList } from "lucide-react";
import { ItemForm } from "@/components/item-form";
import { lookupProductByBarcode } from "@/lib/off";
import { optionalSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getPlacesForList } from "@/lib/data";

// "await searchParams" muss unterhalb einer <Suspense>-Grenze passieren, sonst
// blockiert die Navigation komplett den Server-Render (Next 16 "Instant
// Navigation"-Validierung, siehe node_modules/next/dist/docs/.../
// instant-navigation.md).
export default function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ barcode?: string }>;
}) {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <Confirm searchParams={searchParams} />
    </Suspense>
  );
}

async function Confirm({ searchParams }: { searchParams: Promise<{ barcode?: string }> }) {
  const { barcode } = await searchParams;
  const session = await optionalSession();

  let initialName = "";

  if (barcode) {
    try {
      const result = await lookupProductByBarcode(barcode);
      if (result.found) initialName = result.name ?? "";
    } catch {
      // Lookup fehlgeschlagen -- Nutzer füllt Felder manuell aus.
    }
  }

  if (!session) return <GuestPrompt barcode={barcode} productName={initialName} />;

  const listId = await requireActiveList(session.user.id);
  const [allCategories, allPlaces] = await Promise.all([
    getCategoriesForList(listId),
    getPlacesForList(listId),
  ]);

  return (
    <div className="flex flex-1 flex-col">
      {barcode && !initialName && (
        <p className="px-5 pt-3 text-[13px] font-medium text-muted-foreground">
          Zu Barcode <span className="font-mono">{barcode}</span> ist nichts hinterlegt – bitte
          Details ergänzen.
        </p>
      )}
      {/* key=barcode erzwingt einen frischen ItemForm-Mount pro Barcode: unter
          cacheComponents:true haelt React <Activity> die vorherige Instanz
          samt useState-Werten am Leben, wenn man erneut zu /confirm mit
          anderem Barcode navigiert (gleiche Route, gleiche Baumposition) -
          initialName wuerde sonst nur beim allerersten Scan uebernommen. */}
      <ItemForm
        key={barcode}
        title="Artikel bestätigen"
        categories={allCategories}
        places={allPlaces}
        initialName={initialName}
        barcode={barcode}
        redirectTo="/"
      />
    </div>
  );
}

/**
 * /confirm steht auch Gaesten offen -- wer einen Barcode scannt, soll nicht
 * erst ein Konto anlegen muessen, um zu sehen, was dahintersteckt. Gespeichert
 * wird aber nichts, also fuehrt von hier genau ein Weg weiter.
 */
function GuestPrompt({ barcode, productName }: { barcode?: string; productName: string }) {
  const redirect = `/confirm?barcode=${barcode ?? ""}`;

  return (
    <div className="flex flex-1 flex-col gap-5 px-5 py-6">
      <h1 className="text-2xl leading-tight">Artikel gefunden</h1>

      <div className="flex flex-col gap-2 rounded-3xl border border-border bg-card px-4 py-4">
        <p className="text-lg leading-snug font-bold text-balance">
          {productName || "Unbekanntes Produkt"}
        </p>
        {barcode && <p className="font-mono text-[11.5px] text-faint">{barcode}</p>}
      </div>

      <p className="text-sm leading-relaxed font-medium text-balance text-muted-foreground">
        Als Gast wird nichts gespeichert. Lege ein Konto an oder melde dich an – dieser Artikel
        wartet dann hier auf dich.
      </p>

      {/* Beide Wege behalten den Barcode: wer erst scannt und dann ein
          Konto anlegt, soll genau hier weitermachen und nicht auf einer
          leeren Startseite landen. */}
      <div className="flex flex-col gap-2.5">
        <Link
          href={`/register?redirect=${encodeURIComponent(redirect)}`}
          className="flex h-14 items-center justify-center rounded-2xl bg-primary text-base font-bold text-primary-foreground"
        >
          Konto erstellen und speichern
        </Link>
        <Link
          href={`/login?redirect=${encodeURIComponent(redirect)}`}
          className="flex h-13 items-center justify-center rounded-2xl border border-border bg-card text-[15px] font-semibold"
        >
          Ich habe schon ein Konto
        </Link>
      </div>

      {/* Ohne diesen Weg war /confirm fuer Gaeste eine Sackgasse: wer sich
          (noch) nicht anmelden will, kam von hier nur ueber den
          Zurueck-Knopf des Browsers wieder weg -- und die
          Navigationsleiste gibt es hier bewusst nicht. */}
      <div className="flex flex-col gap-1 border-t border-border pt-4">
        <GuestLink href="/scan" icon={Camera} label="Nächsten Artikel scannen" />
        <GuestLink href="/scan-ean" icon={Barcode} label="EAN eingeben" />
        <GuestLink href="/add" icon={ClipboardList} label="Von Hand eintragen" />
      </div>
    </div>
  );
}

function GuestLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex h-12 items-center gap-3 rounded-2xl px-2 text-[15px] font-semibold text-muted-foreground"
    >
      <Icon className="size-5" />
      {label}
    </Link>
  );
}
