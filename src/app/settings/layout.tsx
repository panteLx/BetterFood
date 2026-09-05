import type { Metadata } from "next";
import { TITLE_TEMPLATE } from "@/lib/metadata";

// Der Titel für /settings selbst; die Unterseiten setzen ihren eigenen und
// überschreiben ihn damit. Im Layout und nicht in der Seite, weil beides hier
// zusammengehört: Der Standardtitel gilt für /settings, die Vorlage für alles
// darunter.
//
// template steht hier ein zweites Mal, obwohl das Root-Layout es schon setzt:
// sobald ein Segment einen Titel vergibt, endet die Vorlage des Elternteils
// an dieser Stelle, und /settings/reminders hieße dann nur "Erinnerungen".
export const metadata: Metadata = {
  title: {
    default: "Einstellungen",
    template: TITLE_TEMPLATE,
  },
};

export default function SettingsLayout({ children }: LayoutProps<"/settings">) {
  return children;
}
