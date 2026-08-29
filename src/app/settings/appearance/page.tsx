import { SubPageHeader } from "@/components/sub-page-header";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AppearancePage() {
  return (
    <div className="flex flex-1 flex-col gap-4.5 px-5 pt-2 pb-4">
      <SubPageHeader title="Darstellung" />
      <ThemeToggle />
      <p className="px-1 text-[13px] leading-relaxed font-medium text-balance text-muted-foreground">
        Der dunkle Modus nutzt gedämpfte Grüntöne statt reinem Schwarz, damit die Ablauf-Farben
        auch nachts unterscheidbar bleiben.
      </p>
    </div>
  );
}
