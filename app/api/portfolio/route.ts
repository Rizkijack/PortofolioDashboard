import { NextRequest, NextResponse } from "next/server";
import { generateMockPortfolio } from "@/lib/portfolio";
import { fetchPrices } from "@/lib/prices";
import { getUniqueCoingeckoIds } from "@/lib/tokens";

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address") as `0x${string}` | null;
  const ids = getUniqueCoingeckoIds();
  const prices = await fetchPrices(ids);
  const portfolio = generateMockPortfolio(address || undefined, prices);
  return NextResponse.json(
    { success: true, data: portfolio },
    { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=4" } }
  );
}
