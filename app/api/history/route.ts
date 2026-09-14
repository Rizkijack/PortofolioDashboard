import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "@/lib/chains";
import { fetchHistory, type HistoryRange } from "@/lib/history";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ALLOWED: HistoryRange[] = ["7d", "30d", "90d"];

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

  const rawRange = (sp.get("range") ?? "7d").toLowerCase();
  const range: HistoryRange = (ALLOWED as string[]).includes(rawRange)
    ? (rawRange as HistoryRange)
    : "7d";

  try {
    const data = await fetchHistory(address, range);
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "history fetch failed" },
      { status: 500 }
    );
  }
}
