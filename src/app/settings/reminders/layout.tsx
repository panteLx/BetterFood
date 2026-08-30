import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Erinnerungen",
};

export default function RemindersLayout({ children }: LayoutProps<"/settings/reminders">) {
  return children;
}
