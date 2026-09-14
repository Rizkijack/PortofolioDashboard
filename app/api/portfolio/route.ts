import { NextRequest, NextResponse } from "next/server";
import { fetchPortfolio } from "@/lib/portfolio";
import { isAddress, parseChainKeys } from "@/lib/chains";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = rateLimit(req);
  if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const sp = req.nextUrl.searchParams;
  const address = sp.get("address");

  if (!isAddress(address)) {
    return NextResponse.json(
      { error: "invalid address — expected 0x-prefixed 40 hex chars" },
      { status: 400 }
    );
  }

  const chains = parseChainKeys(sp.get("chains"));
  const includeZero = sp.get("includeZero") === "1" || sp.get("includeZero") === "true";

  try {
    const data = await fetchPortfolio(address, chains, { includeZero });
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=3, stale-while-revalidate=10" },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "portfolio fetch failed" },
      { status: 500 }
    );
  }
}
