import type { Metadata } from "next";
import { TITLE_TEMPLATE } from "@/lib/metadata";

// Der Titel fuer /settings selbst; die Unterseiten setzen ihren eigenen und
// ueberschreiben ihn damit. Ein Layout, weil die Seite eine
// Client-Komponente ist und kein metadata exportieren kann.
//
// template steht hier ein zweites Mal, obwohl das Root-Layout es schon setzt:
// sobald ein Segment einen Titel vergibt, endet die Vorlage des Elternteils
// an dieser Stelle, und /settings/reminders hiesse dann nur "Erinnerungen".
export const metadata: Metadata = {
  title: {
    default: "Einstellungen",
    template: TITLE_TEMPLATE,
  },
};

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return children;
}
