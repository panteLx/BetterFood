import { RouteModal } from "@/components/route-modal";
import { EanEntryPage } from "@/components/ean-entry-page";

export default function InterceptedScanEanPage() {
  return (
    <RouteModal>
      <EanEntryPage />
    </RouteModal>
  );
}
