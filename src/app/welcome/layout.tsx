import type { Metadata } from "next";

// /welcome ist eine Client-Komponente (Slides mit useState) und kann kein
// metadata exportieren -- dafuer steht dieses Layout hier.
export const metadata: Metadata = {
  title: "Willkommen",
  description:
    "BetterFood behält im Blick, was in Kühlschrank, Gefrierfach und Schrank liegt – und erinnert dich, bevor etwas abläuft.",
};

export default function WelcomeLayout({ children }: LayoutProps<"/welcome">) {
  return children;
}
