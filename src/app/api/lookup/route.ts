import { NextRequest, NextResponse } from "next/server";
import { lookupProductByBarcode } from "@/lib/off";
import { optionalSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  // Der Proxy laesst hier ohnehin niemanden Angemeldeten vorbei; die zweite
  // Pruefung steht trotzdem hier, damit die Route nicht davon abhaengt, in
  // welcher Liste sie steht.
  const session = await optionalSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
