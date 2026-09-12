import { NextRequest, NextResponse } from "next/server";
import { fetchPrices } from "@/lib/prices";

export async function GET(req: NextRequest) {
  const idsParam = req.nextUrl.searchParams.get("ids");
  const ids = idsParam ? idsParam.split(",").map((s) => s.trim()).filter(Boolean) : [];
  if (!ids.length) {
    return NextResponse.json({ success: false, error: "ids required" }, { status: 400 });
  }
  const data = await fetchPrices(ids);
  return NextResponse.json(
    { success: true, data },
    { headers: { "Cache-Control": "public, s-maxage=1, stale-while-revalidate=2" } }
  );
}
