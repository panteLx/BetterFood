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

type UserResult = { id: string; name: string; email: string };

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

  function status() {
    if (pending) return "Suche…";
    if (trimmed.length > 0 && trimmed.length < 2) return "Mindestens 2 Zeichen eingeben.";
    if (trimmed.length >= 2 && results.length === 0) return `Keine Treffer für "${trimmed}".`;
    return null;
  }

  function search(q: string) {
    abortRef.current?.abort();
    if (q.trim().length < 2) {
      setResults([]);
      setPending(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    fetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { users: UserResult[] }) => {
        if (controller.signal.aborted) return;
        setResults(data.users);
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
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
      <ComboboxInputGroup>
        <ComboboxInput placeholder="Name oder E-Mail suchen…" disabled={disabled} />
      </ComboboxInputGroup>
      <ComboboxPortal>
        <ComboboxPositioner>
          <ComboboxPopup>
            <ComboboxStatus>{status()}</ComboboxStatus>
            <ComboboxEmpty />
            <ComboboxList>
              {(u: UserResult) => (
                <ComboboxItem key={u.id} value={u}>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{u.name}</span>
                    <span className="text-xs text-muted-foreground">{u.email}</span>
                  </span>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxPopup>
        </ComboboxPositioner>
      </ComboboxPortal>
    </Combobox>
  );
}
