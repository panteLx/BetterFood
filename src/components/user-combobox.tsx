"use client";

import * as React from "react";
import {
  Combobox,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxPortal,
  ComboboxPositioner,
  ComboboxPopup,
  ComboboxStatus,
  ComboboxEmpty,
  ComboboxList,
  ComboboxItem,
} from "@/components/ui/combobox";

// Ohne E-Mail-Adresse: die Suche gibt sie nicht mehr heraus, damit sich aus
// ihr keine Nutzerliste der ganzen Instanz zusammensuchen laesst. Zum
// Einladen genuegt die id -- und wer jemanden meint, den er nicht am Namen
// erkennt, tippt dessen Adresse vollstaendig ein und trifft ihn exakt.
type UserResult = { id: string; name: string };

export function UserCombobox({
  onSelect,
  disabled,
}: {
  onSelect: (user: UserResult) => void;
  disabled?: boolean;
}) {
  const [results, setResults] = React.useState<UserResult[]>([]);
  const [searchValue, setSearchValue] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const abortRef = React.useRef<AbortController | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = searchValue.trim();

  // Beim Verlassen der Seite duerfen weder ein offener Timer noch eine
  // laufende Anfrage noch etwas setzen wollen.
  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  function status() {
    if (pending) return "Suche…";
    if (trimmed.length > 0 && trimmed.length < 2)
      return "Mindestens 2 Zeichen eingeben.";
    // Der Zusatz ist kein Beiwerk: die Adresse trifft nur vollstaendig, ein
    // Teil davon gar nicht. Ohne den Hinweis sucht man am halben Namen der
    // Adresse weiter und haelt die Person fuer nicht vorhanden.
    if (trimmed.length >= 2 && results.length === 0)
      return `Keine Treffer für „${trimmed}“. E-Mail-Adressen treffen nur vollständig.`;
    return null;
  }

  // Beim Abbrechen lehnt fetch() mit einem AbortError ab. Ohne .catch wurde
  // daraus eine unbehandelte Promise-Ablehnung -- und weil das Auswaehlen
  // eines Treffers das Eingabefeld leert und damit sofort eine neue Suche
  // (also ein abort()) ausloest, passierte genau das bei jedem Hinzufuegen
  // eines Mitglieds. In der Entwicklung riss das die Seite mit dem
  // Fehler-Overlay auf, in Produktion blieb "Suche…" haengen.
  async function search(q: string) {
    abortRef.current?.abort();
    if (q.trim().length < 2) {
      setResults([]);
      setPending(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    try {
      const res = await fetch(
        `/api/users/search?q=${encodeURIComponent(q.trim())}`,
        {
          signal: controller.signal,
        },
      );
      const data = (await res.json()) as { users?: UserResult[] };
      if (controller.signal.aborted) return;
      setResults(data.users ?? []);
    } catch {
      // Abgebrochen oder Netzfehler: der naechste Tastendruck startet ohnehin
      // eine neue Suche.
      if (controller.signal.aborted) return;
      setResults([]);
    } finally {
      if (!controller.signal.aborted) setPending(false);
    }
  }

  function handleInputValueChange(value: string) {
    setSearchValue(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 250);
  }

  return (
    <Combobox
      items={results}
      itemToStringLabel={(u: UserResult) => u.name}
      filter={null}
      value={null}
      inputValue={searchValue}
      onInputValueChange={handleInputValueChange}
      onValueChange={(value: UserResult | null) => {
        if (!value) return;
        onSelect(value);
        setSearchValue("");
        setResults([]);
      }}
    >
      <ComboboxInputGroup className="h-11 rounded-lg">
        <ComboboxInput
          placeholder="Name oder vollständige E-Mail…"
          disabled={disabled}
        />
      </ComboboxInputGroup>
      <ComboboxPortal>
        <ComboboxPositioner>
          <ComboboxPopup>
            <ComboboxStatus>{status()}</ComboboxStatus>
            <ComboboxEmpty />
            <ComboboxList>
              {(u: UserResult) => (
                <ComboboxItem key={u.id} value={u}>
                  <span className="font-medium">{u.name}</span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxPopup>
        </ComboboxPositioner>
      </ComboboxPortal>
    </Combobox>
  );
}
