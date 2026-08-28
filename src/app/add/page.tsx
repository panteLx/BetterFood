import { ItemForm } from "@/components/item-form";

export default function AddPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="p-4">
        <h1 className="text-lg font-semibold">Manuell hinzufügen</h1>
      </div>
      <ItemForm />
    </div>
  );
}
