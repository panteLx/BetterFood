repo: panteLx/BetterFood
branch: main

## Last sync

date: 2026-09-03T18:05:00Z

### Updated in this project

- Ist-Zustand der App aus dem Repo nachgebaut: Start, Vorrat, Produktdetail, Hinzufügen-Blatt, Scanner, Archiv, Gespeichert — hell und dunkel.
- Design-Tokens, Radien, Schatten und Typografie 1:1 aus `globals.css` und `layout.tsx` übernommen (Manrope 400–800, JetBrains Mono, #37714c / #f2f4f0).
- Lucide-Icons als SVG direkt aus `lucide-icons/lucide` kopiert (`icons/`), statt nachgezeichnet.
- Drei verspielte Design-Richtungen (1a Frischebande, 1b Frischometer, 1c Kühlschrank-Karten) mit Animationen, Maskottchen und Trend-Visualisierung.
- Wisch-Zustände auf die echten Schwellen aus `use-swipe-actions.ts` gesetzt (REVEAL 24, COMMIT 76, MAX 130).
- Finale Richtung „Frischling“ mit Avocado-Maskottchen über alle bestehenden Routen gebaut — inkl. Übergabe-Notiz für die Umsetzung.

## Screen map

| Screen im Projekt | Quelldateien im Repo |
| --- | --- |
| Ist-Zustand · Start | `src/app/page.tsx`, `src/components/home-overview.tsx`, `src/components/item-row.tsx`, `src/components/section-label.tsx`, `src/components/list-switcher.tsx`, `src/components/bottom-nav.tsx`, `src/lib/expiry.ts` |
| Ist-Zustand · Vorrat | `src/app/inventory/page.tsx`, `src/components/inventory-list.tsx`, `src/components/ui/chip.tsx`, `src/components/item-row.tsx`, `src/lib/use-swipe-actions.ts` |
| Ist-Zustand · Produktdetail | `src/app/item/[id]/page.tsx`, `src/components/item-detail.tsx`, `src/components/category-icon.tsx`, `src/components/ui/button.tsx` |
| Ist-Zustand · Hinzufügen-Blatt | `src/components/add-action-sheet.tsx`, `src/components/ui/sheet.tsx` |
| Ist-Zustand · Scanner | `src/app/scan/page.tsx`, `src/app/scan/layout.tsx` |
| Ist-Zustand · Archiv | `src/app/archive/page.tsx`, `src/components/archive-view.tsx`, `src/components/archive-stats.tsx`, `src/components/archive-list.tsx` |
| Ist-Zustand · Gespeichert / Toast | `src/app/saved/page.tsx`, `src/components/ui/sonner.tsx` |
| Frischling (Avo) · alle Screens | `src/app/page.tsx`, `src/app/inventory/page.tsx`, `src/app/item/[id]/page.tsx`, `src/app/add/page.tsx`, `src/app/scan/page.tsx`, `src/app/archive/page.tsx`, `src/app/saved/page.tsx` und die zugehörigen Komponenten |
| Verspielt 1a / 1b / 1c | abgeleitet aus allen oben genannten Dateien; Formular- und Kalenderdetails aus `src/components/item-form.tsx`, `src/components/expiry-picker.tsx`, `src/components/date-calendar.tsx` |

Anmerkung: `commit:` bewusst nicht gesetzt — der über die GitHub-Tools aufgelöste Hash (`09356dbb4a65`) ist ein Tree-Hash, kein Commit.
