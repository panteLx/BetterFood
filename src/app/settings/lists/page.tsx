import { SubPageHeader } from "@/components/sub-page-header";
import { ListManager } from "@/components/list-manager";

export default function ListsPage() {
  return (
    <div className="flex flex-1 flex-col gap-4.5 px-5 pt-2 pb-4">
      <SubPageHeader title="Listen" />
      <ListManager />
    </div>
  );
}
