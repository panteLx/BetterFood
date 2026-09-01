import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Monatsziel",
};

export default function GoalLayout({ children }: LayoutProps<"/settings/goal">) {
  return children;
}
