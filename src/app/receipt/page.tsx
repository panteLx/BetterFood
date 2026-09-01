import type { Metadata } from "next";
import { ReceiptImport } from "@/components/receipt-import";
import { requireSession, requireActiveList } from "@/lib/session";

export const metadata: Metadata = {
  title: "Rechnung",
  description: "Eine PDF-Rechnung einlesen und die Artikel daraus übernehmen.",
};

export default async function ReceiptPage() {
  // Kategorien und Fächer holt sich seit Runde 8 der Prüf-Flow selbst: hier
  // wird nur noch hochgeladen und angesehen, entschieden wird unter /review.
  // Die Sitzungspflicht bleibt trotzdem -- der Parser schlägt beim Einlesen
  // in `product_knowledge` dieser Liste nach.
  const session = await requireSession();
  await requireActiveList(session.user.id);

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-4">
      <ReceiptImport />
    </div>
  );
}
