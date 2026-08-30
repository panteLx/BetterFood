import type { Metadata } from "next";
import { ReceiptImport } from "@/components/receipt-import";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList, getPlacesForList } from "@/lib/data";

export const metadata: Metadata = {
  title: "Rechnung",
  description: "Eine PDF-Rechnung einlesen und die Artikel daraus übernehmen.",
};

export default async function ReceiptPage() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const [allCategories, allPlaces] = await Promise.all([
    getCategoriesForList(listId),
    getPlacesForList(listId),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-4 px-5 pt-2 pb-4">
      <ReceiptImport categories={allCategories} places={allPlaces} />
    </div>
  );
}
