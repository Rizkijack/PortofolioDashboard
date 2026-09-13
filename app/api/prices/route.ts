import { NextRequest, NextResponse } from "next/server";
import { fetchQuotesFor, parsePriceIds, fetchSlugQuotes, isCanonicalId } from "@/lib/prices";
import { resolveQuotes, fillFromDexScreener } from "@/lib/oracle";
import { discoverTokens } from "@/lib/discovery";
import { NATIVE_ADDRESS } from "@/lib/types";
import type { ChainKey } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_IDS = 60;

function isNativeAddress(addr: string): boolean {
  const l = addr.toLowerCase();
  return l === NATIVE_ADDRESS.toLowerCase() || l === "0x0000000000000000000000000000000000000000";
}

/**
 * GET /api/prices?ids=ethereum,bitcoin            → slug CoinGecko (ticker UI)
 * GET /api/prices?ids=base:0x…,robinhood:0x…      → id kanonik (resolusi penuh)
 * GET /api/prices?s=base:0x…:ETH,robinhood:0x…:NVDA  → dengan simbol (Tier 1 langsung)
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // ── bentuk dengan simbol eksplisit
  const sParam = sp.get("s");
  if (sParam) {
    const rows = sParam
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean)
      .slice(0, MAX_IDS)
      .map((r) => {
        const [chain, address, symbol] = r.split(":");
        return { chain, address, symbol };
      })
      .filter((r) => r.chain && /^0x[a-fA-F0-9]{40}$/.test(r.address ?? ""));

    const grouped = new Map<string, Array<{ address: string; symbol: string; isNative?: boolean }>>();
    for (const it of rows) {
      const list = grouped.get(it.chain) ?? [];
      list.push({
        address: it.address,
        symbol: it.symbol ?? "",
        isNative: isNativeAddress(it.address),
      });
      grouped.set(it.chain, list);
    }

    const quotes: Record<string, unknown> = {};
    const missing: string[] = [];
    await Promise.all(
      [...grouped.entries()].map(async ([chain, list]) => {
        const resolved = await resolveQuotes(chain as ChainKey, list);
        await fillFromDexScreener(
          chain as ChainKey,
          list.map((i) => ({ address: i.address, symbol: i.symbol })),
          resolved
        );
        for (const it of list) {
          const key = `${chain}:${it.address.toLowerCase()}`;
          const q = resolved.get(it.address.toLowerCase());
          if (q) quotes[key] = q;
          if (!q || q.usd === null) missing.push(key);
        }
      })
    );

    return NextResponse.json({ quotes, fetchedAt: Date.now(), missing });
  }

  const ids = sp.get("ids");
  if (!ids) {
    return NextResponse.json({ error: "ids or s required" }, { status: 400 });
  }

  const parts = ids.split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_IDS);

  // ── id kanonik "chain:0x…"
  if (parts.some(isCanonicalId)) {
    const items = parsePriceIds(ids);
    if (!items.length) return NextResponse.json({ error: "no valid ids" }, { status: 400 });

    // lengkapi simbol dari explorer supaya resolusi bisa naik ke Tier 1/2
    const byChain = new Map<string, typeof items>();
    for (const it of items) {
      const l = byChain.get(it.chain) ?? [];
      l.push(it);
      byChain.set(it.chain, l);
    }
    await Promise.all(
      [...byChain.entries()].map(async ([chain, list]) => {
        try {
          const discovered = await discoverTokens(chain as ChainKey, list[0].address);
          const byAddr = new Map(discovered.map((d) => [d.address, d.symbol]));
          for (const it of list) it.symbol = byAddr.get(it.address.toLowerCase()) ?? "";
        } catch {
          /* simbol tidak wajib */
        }
      })
    );

    const { quotes, missing } = await fetchQuotesFor(items);
    return NextResponse.json(
      { quotes, fetchedAt: Date.now(), missing },
      { headers: { "Cache-Control": "public, s-maxage=3, stale-while-revalidate=10" } }
    );
  }

  // ── slug CoinGecko (ticker UI)
  const quotes = await fetchSlugQuotes(parts);
  return NextResponse.json(
    { quotes, fetchedAt: Date.now(), missing: Object.entries(quotes).filter(([, v]) => v.usd === null).map(([k]) => k) },
    { headers: { "Cache-Control": "public, s-maxage=2, stale-while-revalidate=6" } }
  );
}
