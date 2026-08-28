import { NextRequest, NextResponse } from "next/server";
import { lookupProductByBarcode } from "@/lib/off";

export async function GET(req: NextRequest) {
  const barcode = req.nextUrl.searchParams.get("barcode");
  if (!barcode) {
    return NextResponse.json({ error: "barcode fehlt" }, { status: 400 });
  }

  try {
    const result = await lookupProductByBarcode(barcode);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ found: false });
  }
}
