/**
 * lib/defi/providers/dexscreener.ts — DeFi provider DexScreener.
 *
 * Meng- enrich daftar LP token yang dimiliki user via DexScreener tokens API.
 * Sumber balance: Blockscout v2 token-balances (sama mapping dengan lib/discovery).
 * Enrichment: https://api.dexscreener.com/latest/dex/tokens/{addresses} (max 30 per chunk).
 * Cache: globalCache.swr fresh 20s stale 120s per address.
 * Tidak ada API key. Graceful fallback [] jika error atau chain tidak support.
 */

import { BROWSER_UA, fetchWithTimeout, globalCache } from "../../cache";
import { CHAINS } from "../../chains";
import type { ChainKey } from "../../types";
import type { DefiDiscoveryProvider, DefiPosition } from "../types";

const DEXSCREENER_BASE = "https://api.dexscreener.com";

// Reuse mapping Blockscout bases dari lib/discovery/index.ts
const V2_BASES: Partial<Record<ChainKey, string>> = {
  base: "https://base.blockscout.com",
  ink: "https://explorer.inkonchain.com",
  robinhood: "https://robinhoodchain.blockscout.com",
  hyperevm: "https://hyperevmscan.io",
};

function browserHeaders(base: string, refererPath = "/"): Record<string, string> {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": BROWSER_UA,
    referer: `${base}${refererPath}`,
    origin: base,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  };
}

// Heuristik LP-like: symbol mengandung LP / UNI-V2 / SLP / Cake-LP
const LP_SYMBOL_RE = /(?:\bLP\b|UNI-V2|SLP|Cake-LP)/i;

function isLpLike(symbol: string, name: string): boolean {
  return LP_SYMBOL_RE.test(symbol) || /\bLP\b/i.test(name);
}

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  url?: string;
  baseToken: { address: string; symbol: string; name: string };
  quoteToken: { address: string; symbol: string; name: string };
  liquidity?: { usd?: number; base?: number; quote?: number };
  fdv?: number;
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

interface V2TokenBalance {
  token?: {
    address_hash?: string;
    address?: string;
    symbol?: string | null;
    name?: string | null;
    decimals?: string | number | null;
    type?: string | null;
    exchange_rate?: string | number | null;
  };
  value?: string;
}

/**
 * Enrich daftar alamat LP via DexScreener.
 * Query max 30 alamat per chunk, filter pair.chainId === slug.
 */
export async function enrichLpTokens(chain: ChainKey, lpAddresses: string[]): Promise<DefiPosition[]> {
  if (!lpAddresses.length) return [];
  const slug = CHAINS[chain]?.dexscreenerSlug;
  if (!slug) return [];

  const uniqueLower = [...new Set(lpAddresses.map((a) => a.toLowerCase()).filter(Boolean))];
  if (!uniqueLower.length) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < uniqueLower.length; i += 30) chunks.push(uniqueLower.slice(i, i + 30));

  const inputSet = new Set(uniqueLower);
  const seenPool = new Set<string>();
  const positions: DefiPosition[] = [];

  await Promise.all(
    chunks.map(async (chunk) => {
      const url = `${DEXSCREENER_BASE}/latest/dex/tokens/${chunk.join(",")}`;
      try {
        const res = await fetchWithTimeout(url, {
          timeoutMs: 8_000,
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const json = (await res.json()) as DexScreenerResponse;
        const pairs = json.pairs ?? [];
        for (const pair of pairs) {
          if (pair.chainId !== slug) continue;
          if (!pair.pairAddress) continue;
          const poolAddress = pair.pairAddress.toLowerCase();
          if (seenPool.has(poolAddress)) continue;
          seenPool.add(poolAddress);

          const baseAddr = pair.baseToken.address.toLowerCase();
          const quoteAddr = pair.quoteToken.address.toLowerCase();

          let lpTokenAddress: string | null = null;
          if (inputSet.has(poolAddress)) lpTokenAddress = poolAddress;
          else if (inputSet.has(baseAddr)) lpTokenAddress = baseAddr;
          else if (inputSet.has(quoteAddr)) lpTokenAddress = quoteAddr;
          else {
            // Fallback: coba cari chunk member yang menghasilkan pair ini
            // DexScreener mungkin mengembalikan pair untuk underlying bukan LP token itu sendiri
            // tapi kita tetap catat pool-nya; lpTokenAddress null menandakan pool address != queried token
            lpTokenAddress = null;
          }

          const baseSym = pair.baseToken.symbol?.trim() || "UNKNOWN";
          const quoteSym = pair.quoteToken.symbol?.trim() || "UNKNOWN";
          const symbol = `${baseSym}/${quoteSym} LP`;
          const name = `${baseSym}/${quoteSym} LP on ${pair.dexId}`;

          const reserveUsd =
            typeof pair.liquidity?.usd === "number" && Number.isFinite(pair.liquidity.usd)
              ? pair.liquidity.usd
              : null;

          positions.push({
            chain,
            protocol: pair.dexId ?? "unknown",
            poolAddress,
            lpTokenAddress,
            symbol,
            name,
            type: "lp",
            dexId: pair.dexId ?? null,
            baseSymbol: baseSym,
            quoteSymbol: quoteSym,
            reserveUsd,
            apy: null,
            logoUrl: null,
            discoverySource: "dexscreener",
          });
        }
      } catch {
        // per chunk graceful fallback: lanjutkan chunk lain
      }
    })
  );

  return positions;
}

export const dexscreenerDefiProvider: DefiDiscoveryProvider = {
  id: "dexscreener",
  name: "DexScreener",
  supportsChain: (c: ChainKey) => Boolean(CHAINS[c]?.dexscreenerSlug),
  discoverPositions: async (chain: ChainKey, address: string): Promise<DefiPosition[]> => {
    if (!CHAINS[chain]?.dexscreenerSlug) return [];
    const lower = address.toLowerCase();
    const key = `defi:dexscreener:${chain}:${lower}`;

    try {
      const { value } = await globalCache.swr<DefiPosition[]>(
        key,
        async () => {
          const base = V2_BASES[chain];
          if (!base) return [];

          let rows: V2TokenBalance[];
          try {
            const res = await fetchWithTimeout(`${base}/api/v2/addresses/${address}/token-balances`, {
              timeoutMs: 8_000,
              headers: browserHeaders(base, `/address/${address}`),
              cache: "no-store",
            });
            if (!res.ok) return [];
            const json = (await res.json()) as unknown;
            if (!Array.isArray(json)) return [];
            rows = json as V2TokenBalance[];
          } catch {
            return [];
          }

          const candidates: string[] = [];
          for (const r of rows) {
            const t = r.token;
            const addr = t?.address_hash ?? t?.address;
            if (!addr || !r.value || r.value === "0") continue;
            const sym = t?.symbol?.trim() ?? "";
            const nm = t?.name?.trim() ?? "";
            // Heuristik utama: symbol mengandung LP, atau name mengandung LP
            // Tambahan: token dengan exchange_rate null juga dipertimbangkan jika nanti punya pair di DexScreener,
            // tapi untuk mengurangi noise kita tetap hanya ambil yang LP-like.
            if (isLpLike(sym, nm)) {
              candidates.push(addr.toLowerCase());
            }
          }

          if (!candidates.length) return [];
          try {
            return await enrichLpTokens(chain, candidates);
          } catch {
            return [];
          }
        },
        { freshMs: 20_000, staleMs: 120_000 }
      );
      return value;
    } catch {
      return [];
    }
  },
};
