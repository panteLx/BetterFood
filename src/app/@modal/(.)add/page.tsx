import { RouteModal } from "@/components/route-modal";
import { AddItemPage } from "@/components/add-item-page";

export default function InterceptedAddPage() {
  return (
    <RouteModal>
      <AddItemPage />
    </RouteModal>
  );
}
