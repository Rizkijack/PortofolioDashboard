/**
 * lib/oracle/dexscreener.ts — Tier 3: harga long-tail via DEX + OHLCV.
 * Chain slug terverifikasi: robinhood, base, bsc, hyperevm, ink.
 */

import { fetchWithTimeout, globalCache } from "../cache";
import { CHAINS } from "../chains";
import type { ChainKey, PriceQuote } from "../types";

const BASE = "https://api.dexscreener.com";

export interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url: string;
  baseToken: { address: string; symbol: string; name: string };
  quoteToken: { address: string; symbol: string; name: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  volume?: { h24?: number };
  priceChange?: { h24?: number };
}

export async function fetchPairs(
  chain: ChainKey,
  addresses: string[]
): Promise<Map<string, DexPair>> {
  const out = new Map<string, DexPair>();
  if (!addresses.length) return out;

  const slug = CHAINS[chain].dexscreenerSlug;
  const chunks: string[][] = [];
  for (let i = 0; i < addresses.length; i += 30) chunks.push(addresses.slice(i, i + 30));

  await Promise.all(
    chunks.map(async (chunk) => {
      const key = `dex:${chain}:${[...chunk].sort().join(",").toLowerCase()}`;
      try {
        const { value } = await globalCache.swr(
          key,
          async () => {
            const res = await fetchWithTimeout(`${BASE}/latest/dex/tokens/${chunk.join(",")}`, {
              timeoutMs: 12_000,
              headers: { accept: "application/json" },
            });
            if (!res.ok) throw new Error(`dexscreener ${res.status}`);
            return (await res.json()) as { pairs: DexPair[] | null };
          },
          { freshMs: 10_000, staleMs: 120_000 }
        );

        for (const pair of value.pairs ?? []) {
          if (pair.chainId !== slug) continue;
          // Validasi: ambil harga hanya jika token yang dicari adalah baseToken (priceUsd adalah harga baseToken)
          const baseAddr = pair.baseToken.address.toLowerCase();
          const liq = pair.liquidity?.usd ?? 0;
          const lowerChunk = chunk.map((c) => c.toLowerCase());
          if (lowerChunk.includes(baseAddr)) {
            const prev = out.get(baseAddr);
            if (!prev || liq > (prev.liquidity?.usd ?? 0)) out.set(baseAddr, pair);
          }
        }
      } catch {
        /* tanpa pair → resolver jatuh ke tier lain */
      }
    })
  );

  return out;
}

export function pairToQuote(pair: DexPair): PriceQuote {
  const fetchedAt = Date.now();
  const usd = pair.priceUsd ? Number(pair.priceUsd) : NaN;
  const ok = Number.isFinite(usd) && usd > 0;
  return {
    usd: ok ? usd : null,
    source: "dexscreener",
    updatedAt: fetchedAt,
    fetchedAt,
    ageMs: 0,
    stale: !ok,
    change24h: pair.priceChange?.h24 ?? null,
  };
}

export interface DexOverview {
  priceUsd: number | null;
  liquidityUsd: number | null;
  fdv: number | null;
  marketCap: number | null;
  volume24h: number | null;
  change24h: number | null;
  dexId: string | null;
  pairAddress: string | null;
}

export function overviewOf(pair: DexPair | undefined): DexOverview {
  if (!pair) {
    return {
      priceUsd: null,
      liquidityUsd: null,
      fdv: null,
      marketCap: null,
      volume24h: null,
      change24h: null,
      dexId: null,
      pairAddress: null,
    };
  }
  const usd = pair.priceUsd ? Number(pair.priceUsd) : NaN;
  return {
    priceUsd: Number.isFinite(usd) && usd > 0 ? usd : null,
    liquidityUsd: pair.liquidity?.usd ?? null,
    fdv: pair.fdv ?? null,
    marketCap: pair.marketCap ?? null,
    volume24h: pair.volume?.h24 ?? null,
    change24h: pair.priceChange?.h24 ?? null,
    dexId: pair.dexId ?? null,
    pairAddress: pair.pairAddress ?? null,
  };
}

/** OHLCV dari GeckoTerminal (untuk chart token detail). */
export async function fetchOhlcv(
  chain: ChainKey,
  poolAddress: string,
  timeframe: "minute" | "hour" | "day" = "hour",
  aggregate = 1
): Promise<Array<{ t: number; o: number; h: number; l: number; c: number }>> {
  const network = CHAINS[chain].dexscreenerSlug;
  const key = `gt:ohlcv:${network}:${poolAddress}:${timeframe}:${aggregate}`;
  try {
    const { value } = await globalCache.swr(
      key,
      async () => {
        const res = await fetchWithTimeout(
          `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=168`,
          { timeoutMs: 12_000, headers: { accept: "application/json" } }
        );
        if (!res.ok) throw new Error(`geckoterminal ${res.status}`);
        return (await res.json()) as { data?: { attributes?: { ohlcv_list?: number[][] } } };
      },
      { freshMs: 60_000, staleMs: 300_000 }
    );
    const rows = value.data?.attributes?.ohlcv_list ?? [];
    return rows.map(([t, o, h, l, c]) => ({ t: t * 1000, o, h, l, c })).sort((a, b) => a.t - b.t);
  } catch {
    return [];
  }
}
