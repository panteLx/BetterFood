import type { Metadata } from "next";
import { EditItemPage } from "@/components/edit-item-page";

export const metadata: Metadata = {
  title: "Artikel bearbeiten",
};

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditItemPage id={id} standalone />;
}
