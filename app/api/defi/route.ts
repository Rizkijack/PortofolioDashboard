import { NextRequest, NextResponse } from "next/server";
import { isAddress, parseChainKeys } from "@/lib/chains";
import { discoverAllDefi } from "@/lib/defi";
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
  // includeZero tidak memengaruhi defi LP discovery; tetap diterima untuk kompatibilitas param
  // const includeZero = sp.get("includeZero") === "1" || sp.get("includeZero") === "true";

  const addressLower = address.toLowerCase();

  try {
    const { positions, byChain, warnings } = await discoverAllDefi(addressLower, chains);

    return NextResponse.json(
      {
        address,
        addressLower,
        positions,
        byChain,
        warnings,
        fetchedAt: Date.now(),
        partial: warnings.length > 0,
      },
      {
        headers: { "Cache-Control": "private, max-age=5, stale-while-revalidate=10" },
      }
    );
  } catch (e) {
    console.error("[defi] ", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ error: "defi fetch failed" }, { status: 500 });
  }
}
