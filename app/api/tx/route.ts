import { NextRequest, NextResponse } from "next/server";
import { fetchTx, type TxItem } from "@/lib/tx";
import { isAddress, parseChainKeys } from "@/lib/chains";
import { rateLimit } from "@/lib/rate-limit";
import type { ChainKey } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CHAIN_ORDER: ChainKey[] = ["robinhood", "base", "bsc", "hyperevm", "ink"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export async function GET(req: NextRequest) {
  const rl = rateLimit(req);
  if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const sp = req.nextUrl.searchParams;
  const address = sp.get("address");

  if (!isAddress(address)) {
    return NextResponse.json({ error: "invalid address — expected 0x-prefixed 40 hex chars" }, { status: 400 });
  }

  const chains = parseChainKeys(sp.get("chains"));
  const rawLimit = sp.get("limit");
  let limit = 20;
  if (rawLimit !== null) {
    const n = Number(rawLimit);
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      // clamp but if clearly invalid (like 0 or >50) we still clamp rather than error,
      // unless NaN. Spec says limit 1-50, so enforce bounds via clamp and only error on NaN.
      if (!Number.isFinite(n)) {
        return NextResponse.json({ error: "invalid limit — expected 1-50" }, { status: 400 });
      }
    }
    limit = Math.min(50, Math.max(1, Math.floor(n)));
  }

  // parse nextPageParams JSON if provided
  const rawNext = sp.get("nextPageParams");
  let parsedNext: unknown = null;
  if (rawNext) {
    try {
      parsedNext = JSON.parse(rawNext);
    } catch {
      return NextResponse.json({ error: "invalid nextPageParams — expected JSON" }, { status: 400 });
    }
  }

  try {
    // Determine per-chain next params
    let perChainNext: Record<string, Record<string, string> | null> = {};
    let singleNext: Record<string, string> | null = null;

    if (parsedNext !== null && isRecord(parsedNext)) {
      const keys = Object.keys(parsedNext);
      const hasChainKey = keys.some((k) => (CHAIN_ORDER as string[]).includes(k));
      // If has chain keys and values are records or null, treat as per-chain
      if (hasChainKey) {
        for (const c of chains) {
          const v = (parsedNext as Record<string, unknown>)[c];
          if (v === null || v === undefined) perChainNext[c] = null;
          else if (isRecord(v)) {
            const rec: Record<string, string> = {};
            for (const [kk, vv] of Object.entries(v)) rec[kk] = String(vv);
            perChainNext[c] = rec;
          } else {
            perChainNext[c] = null;
          }
        }
      } else {
        // flat record for single chain
        const rec: Record<string, string> = {};
        for (const [k, v] of Object.entries(parsedNext)) rec[k] = String(v);
        singleNext = rec;
        // map to each chain if single chain, else treat as not per-chain (we'll apply to first if multi?)
        if (chains.length === 1) {
          perChainNext[chains[0]] = rec;
        } else {
          // for multi-chain with flat, we cannot map; ignore pagination and treat as first page
          perChainNext = {};
          singleNext = null;
        }
      }
    } else if (parsedNext !== null) {
      return NextResponse.json({ error: "invalid nextPageParams — expected JSON object" }, { status: 400 });
    }

    // Fetch per chain
    const pages = await Promise.all(
      chains.map(async (chain) => {
        const nextForChain = perChainNext[chain] ?? (chains.length === 1 ? singleNext : null);
        const page = await fetchTx(chain, address, { limit, nextPageParams: nextForChain ?? undefined });
        return { chain, page };
      })
    );

    // Merge & sort
    const allItems: TxItem[] = pages.flatMap((p) => p.page.items);
    allItems.sort((a, b) => {
      const ta = a.timestamp ?? 0;
      const tb = b.timestamp ?? 0;
      if (tb !== ta) return tb - ta;
      return b.blockNumber !== null && a.blockNumber !== null ? (b.blockNumber ?? 0) - (a.blockNumber ?? 0) : 0;
    });

    // Determine hasMore and nextPageParams for response
    let hasMore = pages.some((p) => p.page.hasMore);
    let nextPageParams: Record<string, string> | Record<string, Record<string, string> | null> | null = null;

    if (chains.length === 1) {
      nextPageParams = pages[0]?.page.nextPageParams ?? null;
      hasMore = pages[0]?.page.hasMore ?? false;
    } else {
      // aggregated mapping: chain -> nextPageParams
      const agg: Record<string, Record<string, string> | null> = {};
      let anyHasMore = false;
      for (const p of pages) {
        agg[p.chain] = p.page.nextPageParams ?? null;
        if (p.page.hasMore) anyHasMore = true;
      }
      hasMore = anyHasMore;
      // if all null, return null else aggregated
      const allNull = Object.values(agg).every((v) => v === null);
      nextPageParams = allNull ? null : agg;
    }

    // For multi-chain we already fetched limit per chain; respect global limit by slicing?
    // Keep global limit semantics: slice to limit if multi-chain and we have many items.
    let txs = allItems;
    if (chains.length > 1 && allItems.length > limit) {
      // slice to limit but keep hasMore true if we sliced
      txs = allItems.slice(0, limit);
      // hasMore already true if any chain has more or we truncated
      if (allItems.length > limit) hasMore = true;
    }

    return NextResponse.json(
      {
        address,
        addressLower: address.toLowerCase(),
        txs,
        nextPageParams,
        hasMore,
        fetchedAt: Date.now(),
      },
      {
        headers: { "Cache-Control": "public, s-maxage=5" },
      }
    );
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "tx fetch failed" }, { status: 500 });
  }
}
