# Handoff: BetterFood — „Frischling" (verspieltes Redesign)

## Überblick

BetterFood ist eine selbst gehostete PWA zur Verwaltung von Lebensmittelvorräten (Next.js App Router, React 19, TypeScript, Drizzle/SQLite, better-auth, Tailwind CSS v4, shadcn/ui + Base UI). Repo: `panteLx/BetterFood`, Branch `main`.

Dieses Paket beschreibt ein **rein visuelles Redesign**. Es kommen **keine neuen Funktionen** hinzu. Jede Route, jeder Datenfluss, jede Berechnung, jede Schwelle und jeder Text bleibt wie im Repo — verändert werden Palette, Typografie, Formensprache, Bewegung und ein neues Maskottchen („Avo").

Ziel des Redesigns: die App soll verspielter und jugendlicher wirken, weniger nach Business-Tool. Weich statt kantig, keine Konturen, pralle Radien, Pastellflächen als Träger des Ablauf-Zustands, ein Maskottchen als Begleiter und dezente Mikro-Animationen.

---

## Über die Design-Dateien

Die Dateien in `designs/` sind **Design-Referenzen in HTML** — Prototypen, die Aussehen und Verhalten zeigen. Sie sind **kein Produktionscode zum Kopieren**.

Die Aufgabe ist, diese Designs in der **bestehenden Umgebung von BetterFood** umzusetzen: React-Server- und Client-Komponenten unter `src/app` und `src/components`, Tailwind-Utility-Klassen, Design-Tokens als CSS-Variablen in `src/app/globals.css`, Icons aus `lucide-react`, Sheets/Dialoge aus `@base-ui/react`, Toasts aus `sonner`. Die HTML-Prototypen benutzen Inline-Styles und feste Pixelwerte, weil sie außerhalb des Projekts lauffähig sein müssen — in der App gehören diese Werte in Tokens und Utility-Klassen, genau wie bisher.

**Die Dateien lokal öffnen:** `designs/*.dc.html` direkt im Browser öffnen. `designs/support.js` muss im selben Ordner liegen (Laufzeit für die Prototypen). Alles läuft offline, nur die Google Fonts werden aus dem Netz geladen.

| Datei | Inhalt |
| --- | --- |
| `designs/frischling-avo.dc.html` | **Die Spezifikation.** Farbrollen, Maskottchen in drei Größen, Bausteine, neun Screens, Umsetzungsnotiz. |
| `designs/verspielt-varianten-und-dunkelmodus.dc.html` | **Dunkelmodus** (Runde 3, ganz oben), die sechs Maskottchen-Kandidaten und die vier Stimmungen. Darunter drei verworfene Richtungen — nur als Kontext, nicht umsetzen. |
| `designs/ist-zustand.dc.html` | Der **aktuelle** Stand der App, pixelgenau aus dem Repo nachgebaut. Vergleichsbasis: was sich ändert und was nicht. |
| `github.md` | Repo-Zuordnung und Screen-Map (Screen → Quelldateien). |

---

## Fidelity

**High-Fidelity.** Farben, Schriftgrößen, Gewichte, Abstände, Radien, Schatten und Animationsdauern sind final und in diesem Dokument exakt angegeben. Die UI soll pixelgenau nachgebaut werden — mit den Mitteln, die das Projekt schon hat (Tailwind-Klassen, Tokens, `cn()`, `lucide-react`).

Ausnahme: Die Prototypen zeigen jeden Screen in einem festen 390 × 844 Rahmen (iPhone-Format). Das Layout der App ist bereits `mx-auto w-full max-w-md` — das bleibt so; die 390px sind nur die Bühne.

---

## Design-Tokens

### Farben — Hellmodus

Diese Werte ersetzen die bestehenden Variablen im `:root`-Block von `src/app/globals.css` eins zu eins.

| Rolle | Neu | Bisher | Verwendung |
| --- | --- | --- | --- |
| `--background` | `#eef8ef` | `#f2f4f0` | Seitengrund |
| `--card` | `#ffffff` | `#ffffff` | Karten, Blätter, Navigationsinsel |
| `--surface-2` | `#f5fbf6` | `#f6f8f4` | Zweite Fläche in Karten, ruhige Zeilen, Notizfeld |
| `--foreground` | `#16302a` | `#151c17` | Überschriften, Zeilentitel |
| `--muted-foreground` | `#5d7566` | `#6b7a6e` | **Alle Sätze, Meta-Zeilen, Platzhalter.** 5,00:1 auf Karte, 4,60:1 auf Grund |
| `--faint` | `#7f9a8c` | `#9aa79c` | **Nur kurze Beschriftungen** (Ring-Untertitel, Segment-Labels, Wochentage, KW). 3,04:1 |
| `--primary` | `#23a862` | `#37714c` | Primäraktion, gerettete Werte, aktive Zustände |
| `--primary-light` | `#4fd48c` | — | Nur als heller Anteil im Verlauf primärer Flächen |
| `--primary-deep` | `#1c8f52` | — | Primärfarbe **als Text** auf hellen Flächen |
| `--primary-tint` | `#d5f4e2` | `#e6f0e8` | Aktive Chips, Mengen-Pillen, „frisch"-Tage-Block, /saved-Grund |
| `--warning` | `#ffc94d` | `#a9701a` | Tage-Block „bald fällig" (Fläche) |
| `--warning-ink` | `#a9701a` | — | Warnfarbe als Text |
| `--warning-tint` | `#fff4d6` | `#faefd9` | Zeilenfläche „Heute / Morgen" |
| `--danger` | `#ff8a5c` | `#b24734` | Tage-Block „abgelaufen" (Fläche) |
| `--danger-ink` | `#e2603a` | — | Gefahrfarbe als Text (Abschnittstitel, Knopf „Weggeworfen") |
| `--danger-tint` | `#ffe8dd` | `#f9e4df` | Zeilenfläche „Schon drüber" |
| `--badge` | `#7c6cf0` | — | Abzeichen-Akzent (neu; ersetzt kein bestehendes Token) |
| `--badge-tint` | `#e9e6ff` | — | Abzeichen-Fläche |
| `--track` | `#e4f4e9` | `#eef2ec` | Unbefüllte Spur hinter Fortschritt und Ring |

**Farbe auf getönten Zeilen.** Die Meta-Zeile einer Zeile übernimmt den Farbton ihrer Fläche, damit sie nicht grau darauf sitzt: auf `--danger-tint` → `#b4705a`, auf `--warning-tint` → `#a08a53`, auf `--card`/`--surface-2` → `--faint`.

### Farben — Dunkelmodus

Ersetzen den `.dark`-Block. Anthrazit-Staffelung wie bisher, nur im neuen Farbton. Zu sehen in `verspielt-varianten-und-dunkelmodus.dc.html`, Abschnitt „Dunkelmodus".

| Rolle | Wert |
| --- | --- |
| `--background` | `#131a16` |
| `--card` | `#1c2620` |
| `--surface-2` | `#232f28` |
| `--foreground` | `#eef6f0` |
| `--muted-foreground` | `#a5bbaf` |
| `--faint` | `#7d9187` |
| `--primary` | `#4fd48c` |
| `--primary-foreground` | `#0c2116` |
| `--primary-tint` | `#1e3b2b` |
| `--track` | `#26332c` |
| `--warning` / `--warning-tint` | `#ffd166` / `#322d17` |
| `--danger` / `--danger-tint` | `#ff9c73` / `#33211b` |
| `--badge` / `--badge-tint` | `#9b8cff` / `#262046` |
| Rand (nur wo nötig) | `#26332c` |

Im Dunkeln übernimmt die helle Oberkante die Tiefe, wie bisher: `inset 0 1px 0 rgb(255 255 255 / 0.06)` zusätzlich zum Schatten. Das Maskottchen wird eine Stufe heller (Schale `#3fbd7a`, Fleisch `#dbe86f` bleibt, Kern `#a9713f` bleibt).

### Typografie

Manrope und JetBrains Mono sind bereits über `next/font/google` in `src/app/layout.tsx` eingebunden. **Quicksand kommt hinzu** (Gewichte 500, 600, 700) und wird als dritte CSS-Variable exportiert, z. B. `--font-display`.

| Rolle | Familie | Gewicht | Verwendung |
| --- | --- | --- | --- |
| Display | Quicksand | 700 | Seitentitel, Abschnittstitel, Zeilentitel, Zahlen, Knopfbeschriftungen, Chips |
| Fließtext | Manrope | 500 / 600 | Sätze, Meta-Zeilen, Hinweise, Platzhalter |
| Ziffernfolgen | JetBrains Mono | 500 / 700 | EAN, Kalenderwochen, Mengen (`×3`), Zähler in Abschnittstiteln |

Größen aus den Mocks (`font-size` / `font-weight` / Familie):

| Element | Größe | Gewicht | Familie |
| --- | --- | --- | --- |
| Seitentitel („Dein Vorrat") | 28px | 700 | Quicksand |
| Titel Produktdetail | 26px | 700 | Quicksand |
| Titel /saved | 32px | 700 | Quicksand |
| Abschnittstitel („Heute dran") | 19px | 700 | Quicksand |
| Blatt-Titel („Was soll rein?") | 20px | 700 | Quicksand |
| Zeilentitel (Artikelname) | 16px | 700 | Quicksand |
| Tage-Block, Zahl | 21px (0–2 Zeichen) / 19px (3) / 17px (4+) | 700 | Quicksand |
| Tage-Block, Wort | 9px, `letter-spacing: .08em`, `uppercase` | 800 | Manrope |
| Datumszeile, Meta-Zeile | 13px / 11,5px | 600 | Manrope |
| Feld-Label im Formular | 11,5px, `letter-spacing: .08em`, `uppercase` | 800 | Manrope |
| Primärknopf | 16,5–17px | 700 | Quicksand |
| Chip / Segment | 12,5–13,5px | 700 | Quicksand |

Alle Seitentitel tragen `letter-spacing: -0.01em`. Die `h1,h2,h3 { font-extrabold tracking-tight }`-Regel in `globals.css` wird auf Quicksand 700 umgestellt — Quicksand hat kein 800.

### Radien

`--radius` steigt von `0.875rem` (14px) auf `1.25rem` (20px). Konkret verwendet:

| Element | Radius |
| --- | --- |
| Karte | 30px |
| Blatt (oben) | 34px |
| Zeile im Vorrat | 24px |
| Tage-Block | 19px |
| Kategorie-Kachel (Detail) | 36px |
| Knopf primär / sekundär | 22px / 20px |
| Kalenderzelle | 14px |
| Kachel im Kalender-Rahmen | 26px |
| Navigationsinsel | 28px |
| Chip, Pille, Zähler, Rundknopf, Abzeichen | `999px` |
| Telefonrahmen (nur Mock) | 42px |

### Schatten

**Ränder fallen weg.** `border` wird nur noch als Trennlinie innerhalb von Karten benutzt (`1px solid #eaf4ec`, im Dunkeln `#26332c`). Tiefe kommt aus getönten Schatten:

```
--shadow-row:   0 6px 16px rgba(22,48,42,.05)
--shadow-card:  0 12px 30px rgba(22,48,42,.09)
--shadow-nav:   0 10px 30px rgba(22,48,42,.14)
--shadow-fab:   0 10px 22px rgba(35,168,98,.40)
--shadow-cta:   0 10px 22px rgba(35,168,98,.32)
--shadow-sheet: 0 -10px 30px rgba(22,48,42,.08)   /* Leiste, die von unten hochkommt */
```

Der Scrim hinter Blättern: `rgba(16,42,32,.46)`.

### Abstände

Seitenrand 18px (bisher 20px). Abstand zwischen Zeilen 9px, zwischen Abschnitten 20px, Abschnittstitel zu erster Zeile 11px. Innenabstand Karte 14–20px. Zeile: `padding: 9px 14px 9px 9px`, `gap: 12px`.

---

## Das Maskottchen „Avo"

Eine Avocado. **Keine Bilddatei, kein SVG** — reine `div`/`span`-Formen mit `border-radius`, damit sie Tokens folgt und im Dunkelmodus mitgeht. Als eigene Komponente anlegen, z. B. `src/components/avo.tsx` mit den Props `size: "sm" | "md" | "lg"` und `mood: "happy" | "soon" | "overdue" | "cheer"`.

### Aufbau (Größe `lg`, 128 × 163px)

```
Wrapper           position:relative; width:128px; height:163px
Schale            inset:0;  border-radius:50% 50% 46% 46% / 62% 62% 38% 38%;  background:#2f7f3e
Fleisch           top:17px; left:16px; right:16px; bottom:16px;  gleicher Radius;  background:#dbe86f
Kern              bottom:23px; left:32px; 64×64;  border-radius:999px;  background:#a9713f
Auge links        bottom:49px; left:46px; 13×15;  border-radius:999px;  background:#3b2413
Auge rechts       bottom:49px; left:70px; 13×15;  gleich
Mund              bottom:31px; left:52px; 24×13;  border-radius:0 0 24px 24px;  background:#3b2413
```

**Keine Wangen** — in keiner Größe. Der Kern trägt nur Augen und Mund; genau das hält die Figur auch bei 38px lesbar.

### Größen

| Name | Maße | Einsatz |
| --- | --- | --- |
| `lg` | 128 × 163 | `/saved`, leerer Vorrat, Archiv-Hero (dort als `md`) |
| `md` | 54 × 68 | Kopfbereich Start, Archiv-Hero |
| `sm` | 30 × 38 | Toast, Hinzufügen-Blatt, Scanner-Hinweis |

Die `md`- und `sm`-Geometrie steht ausgeschrieben im Abschnitt „Avo in drei Größen" von `frischling-avo.dc.html` — die Proportionen sind nicht linear skaliert, sondern pro Größe auf ganze Pixel gerundet.

### Stimmungen

Nur Augen und Mund wechseln. Der Zustand kommt aus Daten, die die App schon rechnet — den Eimern aus `src/lib/expiry.ts`:

| Stimmung | Auslöser | Augen | Mund |
| --- | --- | --- | --- |
| `happy` | kein Artikel unter 4 Tagen | ovale Punkte, Blinken alle 4,8s | breiter unterer Halbkreis |
| `soon` | „Heute" oder „Morgen" ist belegt | runde Punkte, kleiner | schmaler Strich (`999px`, 18 × 6) |
| `overdue` | „Abgelaufen" ist belegt | ovale Punkte | kleines Oval (17 × 14, `999px`), Körper mit `bf-shake` |
| `cheer` | direkt nach dem Abhaken | geschlossen: Striche, ±14° gedreht | offener Halbkreis + Zungen-Highlight in `--danger` |

Die Sprechblase daneben trägt die Stimmung in Worten (siehe „Copy").

---

## Screens

Neun Screens in `frischling-avo.dc.html`, jeder mit Route und Quelldatei beschriftet.

### 1. Start — `/` — `src/components/home-overview.tsx`

**Zweck:** „Was muss ich jetzt aufbrauchen?" plus die Bilanz.

**Layout:** eine Spalte, `padding: 34px 18px 0`, unten 104px Platzhalter für die Navigationsinsel. Reihenfolge: Kopfzeile → Frischling-Karte → drei Segmentkacheln → Eimer-Abschnitte.

**Kopfzeile.** Titel und Datumszeile links, Listenwechsel rechts. Der Listenwechsel ist eine Pille (40px hoch, `999px`, weiß, `--shadow-row`, `max-width: 50%`) mit Namen und `chevron-down` in `--faint`.

**Frischling-Karte** — ersetzt die bisherige Hero-Karte. Eine Karte, 30px Radius, `padding: 14px 16px`, `--shadow-card`, `overflow: hidden`. Dekoration: ein 150px-Kreis in `--primary-tint` bei 45 % Deckkraft, `top: -52px; right: -38px`, und zwei aufsteigende Bläschen (7–9px) mit `bf-bubble`.

Vier Zeilen, kompakt gestapelt:

1. **Eine Reihe:** Avo `md` (54 × 68, `bf-bob`) · Sprechblase als Fließtext (15px/700 Quicksand, Unterzeile 12px/600 Manrope in `--muted-foreground`) · Quote-Ring rechts.
   Der Ring: 78 × 78px, `viewBox="0 0 116 116"`, um −90° gedreht, `r=50`, `stroke-width=13`. Spur `--track`, Bogen `--primary`, `stroke-linecap="round"`, `stroke-dasharray="{quota/100 × 314.16} 314.16"`. In der Mitte die Prozentzahl (21px/700 Quicksand) und darunter „gerettet" (10,5px/700 in `--faint`).
   **Der Umfang bleibt die Konstante `RING_CIRCUMFERENCE = 314.16`** aus `home-overview.tsx`.
2. **Pillenzeile:** Serie (30px hoch, `--warning-tint`, Text `--warning-ink`, 🔥 mit `bf-wobble`, Zahl 14,5px/700) · Ersparnis in € · CO₂. Beide letzteren `--surface-2`, 14px/700 Quicksand.
3. **Monatsziel** als schmale Linie: 8px hohe Spur in `--track`, Füllung `linear-gradient(90deg, --primary-light, --primary)`, `bf-grow-h`; rechts daneben „Monatsziel 70 % ✓" (11px/700 in `--primary-deep`), sobald erreicht.
4. **Abzeichen-Fuß:** Trennlinie darüber, drei 34px-Kreise (`--primary-tint` / `--warning-tint` / `--badge-tint` mit den passenden Icons), Zähler „3 von 7 Abzeichen" in `--faint`, rechts der Textknopf „alle" in `--primary-deep`.

**Segmentkacheln** — ersetzen die bisherige 4px-Segmentleiste. Drei gleich breite Karten, 20px Radius, `--shadow-row`, `gap: 7px`. Je Kachel ein 9px-Punkt (`--primary` / `--warning` / `--danger`), die Zahl (19px/700 Quicksand) und darunter das Wort „frisch" / „bald" / „drüber" (11px/700 in `--faint`). Jede Kachel verlinkt in den gefilterten Vorrat, wie die Legende bisher.

**Eimer-Abschnitte.** Titel als Quicksand 19px/700 (statt der bisherigen 11px-Versalien) mit farbigem Zähler-Pill daneben, rechts optional „alle ansehen". Titel und Farbe:

| Titel im Design | Eimer in `EXPIRY_BUCKETS` | Titelfarbe | Zählerfläche |
| --- | --- | --- | --- |
| Schon drüber | Abgelaufen | `--danger-ink` | `--danger-tint` |
| Heute dran | Heute | `--foreground` | `--warning-tint` |
| Morgen | Morgen | `--foreground` | `--warning-tint` |
| Diese Woche | Diese Woche | `--foreground` | `--primary-tint` |
| Später | Später | `--foreground` | `--primary-tint` |

> Die sichtbaren Titel weichen bewusst vom Repo ab („Schon drüber" statt „Abgelaufen", „Heute dran" statt „Heute"). `EXPIRY_BUCKETS.title` ist in `expiry.ts` gleichzeitig der Schlüssel für Gruppierung und Verlinkung — die Tabelle also **nicht** umbenennen, sondern eine Anzeigebezeichnung daneben legen (z. B. ein Feld `label`), sonst biegt eine Textänderung stillschweigend die Links um. Der Kommentar zu `filter` in `expiry.ts` benennt genau diese Falle.

Das Zeilenbudget der Vorschau bleibt: `PREVIEW_ROW_BUDGET = 8`, `PREVIEW_ROWS_PER_BUCKET = 3`, Zuteilung reihum, Rest an „Später", und darunter „Noch N weitere ansehen" mit `chevron-right`.

**Vorratszeile** (`src/components/item-row.tsx`) — das zentrale Element:

```
Zeile        display:flex; align-items:center; gap:12px
             border-radius:24px; padding:9px 14px 9px 9px
             Fläche nach Zustand: --danger-tint / --warning-tint / --card
             --card-Zeilen zusätzlich --shadow-row; getönte Zeilen ohne Schatten
Tage-Block   54×54; border-radius:19px; Spalte, zentriert
             abgelaufen  --danger  auf #ffffff
             bald        --warning auf #4a3608
             frisch      --primary-tint auf --primary-deep
             später      --surface-2 auf --muted-foreground
Titelspalte  Artikelname 16px/700 Quicksand, truncate
             Menge ×N direkt dahinter, JetBrains Mono 12,5px
             Meta-Zeile 11,5px/600, Farbe nach Fläche (siehe oben)
Abhaken      40px Rundknopf rechts, weiße Fläche, check-Icon in --primary-deep
             auf getönten Zeilen mit farbig getöntem Schatten
```

Der `chevron-right` am Zeilenende fällt weg — der Rundknopf übernimmt die rechte Kante. Antippen der Zeile führt weiter auf `/item/[id]`; der Rundknopf hakt direkt ab. Beides bleibt nötig, weil die Wischgeste weder per Tastatur noch mit Screenreader bedienbar ist.

Die Zeile „Abgelaufen" wackelt dezent (`bf-tilt`, 4,6s) — nur die oberste, nicht alle.

**Navigationsinsel** (`src/components/bottom-nav.tsx`): 96px Rahmenhöhe, `padding: 8px 16px 18px`, Insel mit 28px Radius, `rgba(255,255,255,.9)`, `backdrop-filter: blur(20px)`, `--shadow-nav`. Vier Ziele als 46px-Rundfelder (aktiv: `--primary-tint` + `--primary-deep`, Strichstärke 2,2; inaktiv: `--muted-foreground`, Strichstärke 2). Der Hinzufügen-Knopf steht in der Mitte, 56px, rund, `margin-top: -14px` (er überragt die Insel jetzt wieder), Verlauf `160deg, --primary-light → --primary`, `--shadow-fab`, `bf-squish` im Ruhezustand.

`NAV_BOX` steigt entsprechend von `h-22` (88px) auf 96px — **Insel und Platzhalter müssen denselben Wert tragen**, sonst endet der Inhalt unter der Insel oder über einer Lücke.

### 2. Vorrat — `/inventory` — `src/components/inventory-list.tsx`

Kopfzeile wie Start („Dein Vorrat" / „24 von 24 Artikeln"). Darunter:

- **Suche:** 50px hohe Pille (`999px`), weiß, `--shadow-row`, `padding: 0 18px`, `search`-Icon 18px in `--muted-foreground`, Platzhalter 14,5px/600 in `--muted-foreground`.
- **Statusfilter:** drei gleich breite Pillen, 40px. Aktiv: Verlauf `160deg, --primary-light → --primary`, weiße Schrift. Inaktiv: weiß, `--muted-foreground`. Beschriftungen „Alle" / „Bald fällig" / „Drüber".
- **Gruppierung:** Label „Gruppiert" (11,5px/700 in `--muted-foreground`), dann drei 30px-Pillen „Ablauf" / „Ort" / „Kategorie". Aktiv `--primary-tint` auf `--primary-deep`.
- **Abschnitte** wie auf Start, aber ohne „alle ansehen" und ohne Zeilenbudget.
- **Ladezustand:** bis der Stichtag im Client feststeht (`useIsClient`), höchstens sechs Platzhalter in Zeilenhöhe — 72px, 24px Radius, `--surface-2`, pulsierend.

Die Zeile in der Wischgeste nach links zeigt der Screen mit: Fläche darunter `#ffdfd4`, Label „Weggeworfen" rechtsbündig in `#c2482a`, Karte auf `translateX(-118px)`.

### 3. Produktdetail — `/item/[id]` — `src/components/item-detail.tsx`

- **Kopfzeile:** drei 44px-Rundknöpfe auf weißer Fläche mit `--shadow-row` — zurück links, Bearbeiten und Löschen rechts. Löschen in `--danger-ink`.
- **Kopfbereich:** 104px-Kachel, 36px Radius, Fläche nach Ablauf-Zustand (hier `--warning-tint`), darin das Kategorie-Piktogramm 50px, Strichstärke 1,6. **Die Pfade bleiben unverändert** aus `src/components/category-icon.tsx`. Darunter Titel (26px/700 Quicksand, `text-wrap: balance`), Kategorie, und die Statuspille (38px, `999px`, Fläche und Text nach Zustand) mit dem Text aus `expiryLabel()`.
- **Datenliste:** eine Karte, 28px Radius, `padding: 4px 18px`, Zeilen 14px hoch getrennt durch `1px solid #eaf4ec`. Label 13,5px/600 in `--muted-foreground`, Wert 14,5px/700 Quicksand. Die Menge ist eine `--primary-tint`-Pille statt bloßem Text.
- **Notiz:** 24px-Radius-Block in `--surface-2`, 14px/600, `line-height: 1.65`.
- **Aktionsleiste:** klebt unten, weiße Fläche mit `border-radius: 32px 32px 0 0` und `--shadow-sheet`. Oben „Aufgebraucht" (58px, Verlauf, `check`-Icon), darunter „Nachgekauft" (`--surface-2`) und „Weggeworfen" (`--danger-tint` auf `--danger-ink`), beide 52px.

### 4. Hinzufügen-Blatt — `src/components/add-action-sheet.tsx` + `src/components/ui/sheet.tsx`

Das Blatt selbst: `border-radius: 34px 34px 0 0`, weiß, `padding: 14px 16px 32px`, Griffleiste 44 × 5px in `#dbe8dd`. Es fährt mit `bf-slide-in` (0,4s, `cubic-bezier(.2,.8,.3,1)`) ein. Scrim `rgba(16,42,32,.46)`.

Titel „Was soll rein?" (20px/700 Quicksand) mit Avo `sm` daneben — statt „Wie möchtest du hinzufügen?".

Vier Optionen, 24px Radius, `padding: 15px`, `gap: 14px`. Jede mit 46px-Rundfeld für ihr Icon:

| Option | Icon | Feld | Hinweis |
| --- | --- | --- | --- |
| Barcode scannen | `camera` | `rgba(255,255,255,.22)` auf Verlaufsfläche | Am schnellsten für Verpacktes |
| EAN eingeben | `barcode` | `--primary-tint` / `--primary-deep` | Wenn die Kamera nicht mitspielt |
| Von Hand eintragen | `clipboard-list` | `--warning-tint` / `--warning-ink` | Salat, Reste, Selbstgemachtes |
| Rechnung einlesen | `receipt` | `--badge-tint` / `--badge` | Wenn Lebensmittel geliefert wurden |

Die erste Option ist hervorgehoben (Verlauf + `--shadow-cta`), die übrigen liegen auf `--surface-2`. Reihenfolge und Ziele bleiben wie im Repo.

### 5. Von Hand eintragen — `/add` — `src/components/item-form.tsx` + `expiry-picker.tsx` + `date-calendar.tsx`

Reihenfolge der Felder unverändert: Name → Kategorie → Ort → Menge → Haltbar bis → Notiz. Feld-Labels als 11,5px-Versalien in `--faint`.

- **Name:** 56px hohes Feld, 22px Radius, weiß, `--shadow-row`, Text 16px/700 Quicksand. Vorschläge darunter als 32px-Pillen in `--surface-2` (die gestrichelte Umrandung fällt weg).
- **Kategorie:** umlaufende 34px-Pillen. Aktiv `--primary-tint` / `--primary-deep`. „Neue Kategorie" als Pille mit `plus`-Icon in `--primary-deep`.
- **Ort:** drei gleich breite 44px-Felder, 16px Radius.
- **Menge:** 56px-Pillenleiste mit zwei 44px-Rundknöpfen (Minus `--surface-2`, Plus `--primary-tint`) und der Zahl in 20px/700 Quicksand. Die 44px-Trefferfläche bleibt Pflicht.
- **Haltbar bis:** die Zeile „Sprünge ab heute" bzw. „ab Kaufdatum", dann fünf 34px-Sprungpillen in Mono 11,5px (`+3 Tg`, `+1 Wo`, `+2 Wo`, `+1 Mon`, `+1 J`) — aktiv `--primary-tint`, in der Vergangenheit liegende ausgegraut. Darunter der offene Kalender in einer 26px-Kachel: Monatskopf mit zwei 36px-Rundknöpfen, Wochentage Mo–So (11px/700 in `--faint`), Raster `grid-cols-7`, `gap: 3px`, Zellen 38px hoch mit 14px Radius. Gewählter Tag: Verlauf + weiße Schrift. Unbestätigter Richtwert: `ring-[1.5px] ring-inset` in `--primary` (unverändert die Aussage aus `date-calendar.tsx`). Vergangene Tage `#cdd8cf`, nicht klickbar.
- Darunter die Ergebniszeile („Do., 10. September 2026 · in 7 Tagen") und der Haltbarkeits-Hinweis in `--muted-foreground`.
- **Notiz:** 76px hoch, 22px Radius, weiß.
- **Speichern:** 58px, Verlauf, in einer klebenden weißen Leiste mit `32px 32px 0 0`.

`/edit/[id]` behält das Blatt statt des offenen Kalenders (`inlineExpiry` bleibt false) — dort steht ein echtes, früher gewähltes Datum.

### 6. Scanner — `/scan` — `src/app/scan/page.tsx`

Bleibt dunkel in beiden Themes, wie bisher (`className="dark"` auf dem Wrapper). Grund `#0d1512`, Platzhalter-Verlauf `radial-gradient(120% 80% at 50% 30%, #2c3a30 0%, #16201a 60%, #0d1512 100%)` solange die Kamera startet.

- Kopfzeile: zwei 44px-Rundknöpfe in `rgba(255,255,255,.16)` mit `backdrop-filter: blur(6px)`, Titel „Scanner" 16px/700 Quicksand.
- Sucherausschnitt: 262 × 186px, **34px Radius** (vorher 26px), `box-shadow: 0 0 0 3px rgba(255,255,255,.92), 0 0 0 2000px rgba(0,0,0,.46)` — derselbe Trick wie bisher, um alles außerhalb abzudunkeln. Scanlinie 4px in `--primary-light`, `box-shadow: 0 0 20px`, `bf-scan` 2,1s.
- Hinweis darunter jetzt in einer 24px-Kachel (`rgba(255,255,255,.1)`, `blur(8px)`) mit Avo `sm`: „Einfach weiterscannen." / „Geprüft wird danach — einer nach dem anderen."
- Ablage: 26px-Radius-Kachel, Kopf „Ablage · 3 erfasst" (11px-Versalien), Einträge als 14px-Radius-Zeilen auf `rgba(255,255,255,.06)`. Der gerade erkannte Eintrag auf `rgba(79,212,140,.18)` mit „gerade erkannt" in `#7ce8a8`, EAN in Mono.
- Knöpfe: „N Artikel prüfen" (56px, Verlauf, Schrift `#0b1f14`), darunter „EAN von Hand eingeben" als reiner Text.

Der Reader selbst, die Formatliste, das Wiederanlaufen der Kamera, die Entdopplung und `switchTorch` bleiben unangetastet.

### 7. Archiv — `/archive` — `archive-stats.tsx` + `archive-list.tsx`

- **Statistik-Karte** mit Avo `md` in Stimmung `cheer` links neben der Quote (40px/700 Quicksand in `--primary-deep`) und „gerettet diesen Monat" darunter. Fortschritt als 14px-Spur mit Verlauf, darüber ein Glanzband (`bf-sheen`, 3s, 1,4s Verzögerung).
- Drei Kacheln in `--surface-2`: gerettet (`--primary-deep`), weggeworfen (`--danger-ink`), Wochen ohne Verschwendung (`--badge`).
- **Wochenverlauf:** „Letzte 8 Wochen" mit Delta („▲ 14 %") rechts. Acht Spalten, `gap: 6px`, 74px hoch. Je Woche ein grünes Segment oben (`--primary`, in der aktuellen Woche gesättigt) und ein rotes darunter (`--danger`), Radien `8px 8px 0 0` bzw. `0 0 8px 8px`; bei nur einem Anteil voller 8px-Radius; leere Woche ein 6px-Stummel in `--track`. Beide Segmente wachsen mit `bf-grow-up`, gestaffelt um 60ms. KW-Beschriftung in Mono 9,5px.
  **Die Farben bleiben zwei harte Flächen, kein Verlauf** — der Balken zeigt ein Verhältnis, keinen Übergang. Der bisherige `linear-gradient`-Trick mit hartem Stop funktioniert genauso.
- **Archiv-Zeilen:** 24px Radius, weiß, `--shadow-row`, `padding: 13px 16px`. Titel 16px/700 Quicksand, darunter eine Statuspille („Aufgebraucht" `--primary-tint` / „Weggeworfen" `--danger-tint`) plus Kategorie und Datum in `--faint`.

### 8. Gespeichert — `/saved` — `src/app/saved/page.tsx`

**Das ist der Screen nach dem Hinzufügen** — nicht nach dem Abhaken.

Ganzflächig `--primary-tint`, zwei große Kreise in `#c1eed3` als Dekoration. Avo `lg` in Stimmung `cheer`, `bf-pop` (0,7s), dahinter ein weißer Ring mit `bf-burst`. Fünf Konfetti-Teile (11 × 15px Rechtecke und 10px-Punkte in `--primary`, `--warning`, `--danger`, `--badge`) mit `bf-confetti`, versetzten Verzögerungen und je eigenem `--dx`/`--dr`.

Darunter „Gespeichert!" (32px/700 Quicksand), ein Satz mit Artikelname und Ort, eine weiße Info-Karte („Haltbar bis" / „Im Vorrat: jetzt 3×") und die beiden Knöpfe aus dem Repo: der nächste Artikel **auf demselben Weg** (`ENTRY_METHODS[method].nextLabel`) und „Fertig". Alle drei Blöcke fahren gestaffelt mit `bf-slide-in` ein (0,12s / 0,22s / 0,32s).

### 9. Leerer Vorrat und Abhaken-Toast

**Leerer Vorrat** (`src/components/empty-state.tsx`): Avo `lg` mit neutralem Mund (16 × 6px Strich) statt des bisherigen Icon-Quadrats, dann Titel „Hier ist noch nichts drin", ein Satz, und der Knopf „Ersten Artikel hinzufügen", der wie bisher das Auswahl-Blatt öffnet (nicht direkt in die Kamera).

**Abhaken-Toast** (`src/components/ui/sonner.tsx`): **Abhaken bekommt keinen eigenen Bildschirm.** Der Toast bleibt invertiert wie im Repo — Fläche `--foreground`, Schrift `--background`, Radius 22px (vorher 16px), `padding: 13px 16px`. Links Avo `sm` in `cheer` mit `bf-squish`, dann Titel („1× Vollmilch 3,5 % aufgebraucht", 14,5px/700 Quicksand) und Unterzeile („Noch 2 übrig · Serie steht bei 13 🔥", 12,5px/600 bei 70 % Deckkraft). Rechts „Rückgängig" als **reiner Text** in `--primary-inv` (hell: `#7ce8a8`, dunkel: `#1a7039`) — kein gefüllter Knopf. Drei Konfetti-Krümel fallen über dem Toast.

Der Toast liegt über der Liste, `bottom: 106px` (über der Navigationsinsel). Die abgehakte Zeile bleibt mit verringerter Menge stehen und quittiert mit einem einzelnen `bf-squish`; erst bei der letzten Einheit verschwindet sie.

---

## Interaktionen und Verhalten

Alles Verhalten bleibt wie im Repo. Was sich ändert, ist nur die Rückmeldung.

| Aktion | Verhalten |
| --- | --- |
| Zeile antippen | → `/item/[id]`. Nach einer Wischgeste unterdrückt (`wasSwipe()`). |
| Rundknopf in der Zeile | Hakt sofort ab (`used`), optimistisch, Toast mit „Rückgängig". |
| Wischen nach rechts | Aufgebraucht. Label ab 24px sichtbar, löst ab 76px aus, max. 130px — `REVEAL_DISTANCE`, `COMMIT_DISTANCE`, `MAX_DISTANCE` aus `src/lib/use-swipe-actions.ts`, **unverändert**. |
| Wischen nach links | Weggeworfen. Gleiche Schwellen. |
| Nur Finger/Stift | `event.pointerType === "mouse"` bleibt ausgeschlossen. |
| Rückfedern | `transition-transform duration-200`; während des Ziehens `transition-none`. Kein `transform` bei Offset 0 (sonst verblasst die Kante durch Subpixel-Rundung). |
| Blatt öffnen | `bf-slide-in`, 0,4s. |
| Speichern | → `/saved?name=…&date=…&method=…`, Formular-Reset im Cleanup wie bisher. |
| Nav beim Scrollen | `useHideOnScrollDown` bleibt; die weggefahrene Insel weicht dem einzelnen 56px-Rundknopf unten rechts. |

### Animationen

Sieben Keyframes decken alles ab. **Reines CSS, kein JavaScript.** Als `@keyframes` in `globals.css` und als `--animate-*`-Tokens im `@theme inline`-Block, genau wie die bestehenden `bf-pop` / `bf-rise` / `bf-scan`.

| Name | Dauer / Easing | Wirkung | Einsatz |
| --- | --- | --- | --- |
| `bf-bob` | 3,4–4,6s, `ease-in-out`, endlos | ±6px senkrecht | Avo im Ruhezustand |
| `bf-blink` | 4,2–5,6s, endlos | Augen auf `scaleY(.1)` bei 96 % | Avo, `happy` und `soon` |
| `bf-squish` | 1,6–3,4s, `ease-in-out` | 1,05/0,94 → 0,98/1,03 → 1 | Hinzufügen-Knopf, Avo im Toast, abgehakte Zeile (einmalig) |
| `bf-pop` | 0,7s, `cubic-bezier(.2,.8,.3,1)`, einmalig | 0,4 → 1,18 → 0,94 → 1 | Avo auf `/saved` |
| `bf-slide-in` | 0,4–0,45s, `ease`, einmalig, gestaffelt | 18px von unten + Deckkraft | Blätter, Toast, Blöcke auf `/saved` |
| `bf-grow-h` / `bf-grow-up` | 0,5–1,1s, `cubic-bezier(.2,.8,.3,1)` bzw. `ease` | Breite bzw. `scaleY` von 0 | Fortschrittsleisten, Wochenbalken |
| `bf-confetti` | 2,2–3s, `ease-in`, endlos | 300px Fall + Rotation, je Teil eigenes `--dx`/`--dr` | `/saved`, Toast |
| `bf-ring` | 1,3s, `cubic-bezier(.2,.8,.3,1)`, einmalig | `stroke-dashoffset` von `314.16` auf 0 | Quote-Ring |
| `bf-tilt` / `bf-shake` | 3,4–4,6s, endlos | ±1,5° bzw. ±3px | oberste abgelaufene Zeile, Avo `overdue` |
| `bf-bubble` | 4,4–5,2s, endlos | 70px aufsteigen, ausblenden | Bläschen in der Frischling-Karte |
| `bf-burst` | 1,6–2s, `ease-out`, endlos | Ring von 0,2 auf 2,4, ausblenden | hinter Avo auf `/saved` |
| `bf-sheen` | 2,6–3s, `ease-in-out`, endlos | Glanzband über eine Leiste | Fortschritt im Archiv, Monatsziel auf `/saved` |

**`prefers-reduced-motion: reduce`** muss alle Endlosschleifen abschalten (`animation: none`) und Einmal-Animationen auf `animation-duration: .01ms` setzen — sonst zappelt die Startseite dauerhaft. Das ist die einzige Erweiterung, die das Redesign an CSS-Verhalten braucht.

---

## State

Keine neuen Zustände, mit einer Ausnahme: **die Stimmung des Maskottchens.** Sie ist rein abgeleitet, kein `useState`:

```ts
// aus den Eimern, die home-overview.tsx schon rechnet
const mood =
  buckets.expired > 0 ? "overdue"
  : buckets.soon > 0   ? "soon"
  : "happy";
```

`cheer` ist kein Zustand der Seite, sondern eine Eigenschaft der Stelle: Toast, `/saved` und die Archiv-Statistik zeigen immer `cheer`.

Alles andere bleibt: optimistische Mengen in `home-overview.tsx`, `inventory-list.tsx` und `item-detail.tsx`; `useIsClient` als Schutz gegen `new Date()` im Server-Render; die Ableitung während des Renders bei geänderten `initialItems`; `key={filter}` auf `InventoryList`; die `useMemo`-Ketten für Eimer, Statistik und Kalenderzellen.

---

## Copy

Geändert wird nur, was auf die Screens gehört — der Rest bleibt wörtlich.

| Stelle | Bisher | Neu |
| --- | --- | --- |
| Abschnitt „Abgelaufen" | Abgelaufen | Schon drüber |
| Abschnitt „Heute" | Heute | Heute dran |
| Segment-Legende | 3 bald · 2 abgelaufen · 24 gesamt | frisch · bald · drüber (als drei Kacheln) |
| Blatt-Titel | Wie möchtest du hinzufügen? | Was soll rein? |
| Filter „Abgelaufen" | Abgelaufen | Drüber |
| Leerer Vorrat, Titel | Dein Vorrat ist noch leer | Hier ist noch nichts drin |
| Leerer Vorrat, Text | … danach übernimmt BetterFood. | … danach übernehme ich. |
| Toast-Unterzeile | (nur „noch N übrig") | Noch N übrig · Serie steht bei 13 🔥 |
| Abzeichen-Fuß, Knopf | Alle ansehen | alle |

**Sprechblase** (Frischling-Karte), nach Stimmung:

| Stimmung | Zeile 1 | Zeile 2 |
| --- | --- | --- |
| `overdue` | Zwei Sachen sind drüber. | Kriegen wir noch hin! |
| `soon` | Heute ist was dran. | Zwei Sachen wollen aufgebraucht werden. |
| `happy` | Alles frisch. | Nichts läuft in den nächsten Tagen ab. |

Zahlwörter je nach Anzahl beugen; „Kriegen wir noch hin!" ist der Ton, den die Figur durchgehend trägt — zupackend, nicht belehrend.

---

## Assets

- **Icons:** ausschließlich `lucide-react`, schon im Projekt. Verwendet: `house`, `list`, `archive`, `sliders-horizontal`, `plus`, `minus`, `check`, `chevron-left/right/down`, `arrow-left`, `pencil`, `trash-2`, `search`, `x`, `camera`, `barcode`, `clipboard-list`, `receipt`, `flashlight`, `sprout`, `flame`, `target`, `trophy`. Die SVG-Pfade in den Prototypen sind aus `lucide-icons/lucide@main` kopiert, nicht nachgezeichnet.
- **Kategorie-Piktogramme:** unverändert die zwölf Pfade aus `src/components/category-icon.tsx`.
- **Maskottchen:** keine Datei — reine CSS-Formen (siehe oben).
- **Emoji:** nur 🔥 (Serie) und 🎉 (Wisch-Label, Zielerreichung). Systemfont, keine Bilddatei.
- **Schriften:** Manrope und JetBrains Mono über `next/font/google` (vorhanden), Quicksand kommt dazu.
- **App-Icon:** `src/app/icon.svg` und `apple-icon.png` behalten das Blatt. Falls Avo das Icon werden soll, ist das eine eigene Entscheidung — `npm run icons` baut die Icons aus dem Blatt-Zeichen, das müsste dann mit.

---

## Zu prüfende Punkte

1. **Kontrast.** `--muted-foreground: #5d7566` trägt jeden Satz, jede Meta-Zeile und jeden Platzhalter (5,00:1 auf Karte). `--faint: #7f9a8c` ist nur für kurze Beschriftungen (3,04:1). **Kein Text darf heller als `--faint` werden.** Die Notiz in `globals.css` zur dunklen `--faint` — bewusst auf `#8e958f` gehoben, weil „die Meta-Zeile jeder Vorratszeile genau diesen Ton trägt" — gilt für die helle Palette genauso.
2. **Trefferflächen.** Rundknöpfe 40px sind knapp unter den 44px, die `size="icon-touch"` in `src/components/ui/button.tsx` als Apple-HIG-Minimum setzt. In der Zeile ist das vertretbar, weil die ganze Zeile ein zweites, großes Ziel ist — aber freistehende Rundknöpfe (Kopfzeile Detail, Kalender-Monatswechsel) bleiben bei 44px oder mehr.
3. **`NAV_BOX`.** Insel und Platzhalter teilen einen Wert. Steigt die Insel auf 96px, muss der Platzhalter mit.
4. **Eimer-Titel.** Nicht `EXPIRY_BUCKETS.title` umbenennen (siehe Screen 1).
5. **Dunkelmodus des Scanners.** Bleibt dunkel in beiden Themes; das `dark` auf dem Wrapper ist eine Feststellung, kein Theme-Schalter.
6. **Quicksand-Gewichte.** Nur 500/600/700 laden. Es gibt kein 800 — alle bisherigen `font-extrabold`-Stellen für Überschriften werden 700.

---

## Dateien

```
design_handoff_frischling/
├── README.md                                        ← dieses Dokument
├── github.md                                        ← Repo-Zuordnung und Screen-Map
└── designs/
    ├── frischling-avo.dc.html                       ← Spezifikation, 9 Screens
    ├── verspielt-varianten-und-dunkelmodus.dc.html  ← Dunkelmodus, Maskottchen-Varianten
    ├── ist-zustand.dc.html                          ← aktueller Stand als Vergleich
    └── support.js                                   ← Laufzeit der Prototypen
```

Alle drei HTML-Dateien direkt im Browser öffnen. `support.js` muss daneben liegen.
