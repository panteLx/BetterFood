import type { Metadata } from "next";
import { SubPageHeader } from "@/components/sub-page-header";
import { AccountManager } from "@/components/account-manager";

export const metadata: Metadata = {
  title: "Konto",
};

export default function AccountPage() {
  return (
    <div className="flex flex-1 flex-col gap-4.5 px-5 pt-2 pb-4">
      <SubPageHeader title="Konto" />
      <AccountManager />
    </div>
  );
}
