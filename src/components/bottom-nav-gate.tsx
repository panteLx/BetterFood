import { optionalSession } from "@/lib/session";
import { BottomNav } from "@/components/bottom-nav";

/**
 * Die Navigationsleiste hat für Gäste keinen Sinn: Start, Archiv und
 * Einstellungen sind allesamt geschützt und führen nur zurück auf /login.
 * Auf /scan und /confirm -- den beiden Seiten, die Gästen offenstehen --
 * stand sie damit als reine Sackgasse im Weg und nahm dem Kamerabild Platz.
 *
 * Die Prüfung gehört auf den Server: der Client kann die Session nicht sehen,
 * und ein kurz eingeblendetes und wieder verschwindendes Menü wäre schlechter
 * als eines, das einen Wimpernschlag später erscheint. Deshalb steht im
 * Layout auch kein Platzhalter mehr unter dem Suspense.
 */
export async function BottomNavGate() {
  const session = await optionalSession();
  if (!session) return null;

  return <BottomNav />;
}
