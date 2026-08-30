import type { Metadata } from "next";
import { EanEntryPage } from "@/components/ean-entry-page";

export const metadata: Metadata = {
  title: "EAN eingeben",
};

export default function ScanEanPage() {
  return <EanEntryPage />;
}
