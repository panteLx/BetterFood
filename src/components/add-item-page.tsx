import { ItemForm } from "@/components/item-form";
import { requireSession, requireActiveList } from "@/lib/session";
import { getCategoriesForList } from "@/lib/data";

export async function AddItemPage() {
  const session = await requireSession();
  const listId = await requireActiveList(session.user.id);

  const allCategories = await getCategoriesForList(listId);

  return (
    <div className="flex flex-1 flex-col">
      <div className="p-4">
        <h1 className="text-lg font-semibold">Manuell hinzufügen</h1>
      </div>
      <ItemForm categories={allCategories} />
    </div>
  );
}
