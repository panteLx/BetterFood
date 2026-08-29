import { EditItemPage } from "@/components/edit-item-page";

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditItemPage id={id} />;
}
