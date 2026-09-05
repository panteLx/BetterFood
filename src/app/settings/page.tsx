import { Suspense } from "react";
import { RecipesSettingsRow } from "@/components/recipes-settings-row";
import { SettingsScreen } from "@/components/settings-screen";

/**
 * Die Seite ist nur noch die Hülle -- der Bildschirm selbst steht in
 * components/settings-screen.tsx.
 *
 * Aufgeteilt, weil eine einzige Zeile eine Antwort vom Server braucht: Ob
 * „Rezepte" hier auftaucht, hängt an GEMINI_API_KEY, und den liest nur der
 * Server. Der Bildschirm bleibt eine Client-Komponente (Theme, Session, zwei
 * fetch-Aufrufe), und eine Client-Komponente kann keine Server-Komponente
 * rendern -- also reicht die Seite sie als Prop hinein. Dieselbe Bauart wie
 * `settingsEntry` in app/page.tsx.
 *
 * Hinter <Suspense>, weil RecipesSettingsRow die Umgebung liest und dafür ein
 * `connection()` braucht: ohne die Grenze zöge das die ganze Seite aus dem
 * Prerender. Ohne Platzhalter, denn der häufigere Fall ist „keine Zeile" --
 * reservierte Luft am Ende der Karte stünde dann dauerhaft leer.
 *
 * Der key ist nicht dekorativ: React reicht eine Suspense-Grenze, die als
 * Prop über die Server/Client-Grenze geht, als Liste weiter und meldet sonst
 * „Each child in a list should have a unique key prop" in der Konsole.
 */
export default function SettingsPage() {
  return (
    <SettingsScreen
      recipesRow={
        <Suspense key="recipes-settings-row" fallback={null}>
          <RecipesSettingsRow />
        </Suspense>
      }
    />
  );
}
