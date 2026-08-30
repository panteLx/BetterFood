import type { Metadata } from "next";

// Die Seite selbst ist eine Client-Komponente (Kamera, ZXing) und kann
// deshalb kein metadata exportieren -- dafuer steht dieses Layout hier, das
// sonst nichts tut.
export const metadata: Metadata = {
  title: "Barcode scannen",
};

export default function ScanLayout({ children }: LayoutProps<"/scan">) {
  return children;
}
