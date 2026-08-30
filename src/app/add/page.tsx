import type { Metadata } from "next";
import { AddItemPage } from "@/components/add-item-page";

export const metadata: Metadata = {
  title: "Artikel eintragen",
};

export default function AddPage() {
  return <AddItemPage standalone />;
}
