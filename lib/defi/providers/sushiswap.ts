/**
 * lib/defi/providers/sushiswap.ts — DeFi provider SushiSwap V2 (SLP) untuk SEMUA 5 chain.
 *
 * Chain support: base, bsc, ink, hyperevm, robinhood
 * - V2: reuse Blockscout token-balances (symbol SLP) → enrich via DexScreener,
 *       filter dexId === "sushiswap".
 *       Base/Ink/Robinhood/HyperEVM via Blockscout V2; BSC tidak ada Blockscout publik → graceful [] (DexScreener provider terpisah handle BSC SLP).
 * - Cache: globalCache.swr fresh 20s stale 120s key defi:sushiswap:${chain}:${address}. Tidak ada API key. Tidak throw — selalu return [] on error.
 */

import { BROWSER_UA, fetchWithTimeout, globalCache } from "../../cache";
import { CHAINS } from "../../chains";
import type { ChainKey } from "../../types";
import type { DefiDiscoveryProvider, DefiPosition } from "../types";

// Blockscout v2 bases — BSC tidak punya Blockscout publik → graceful [] di discoverSushiswapForChain (coverage BSC via DexScreener provider terpisah)
// Base/Ink/Robinhood/HyperEVM sudah punya Blockscout publik → V2 SLP akan jalan
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

// Heuristik SLP: symbol mengandung SLP / SUSHI-LP
const SLP_RE = /SLP/i;
const SUSHI_LP_RE = /SUSHI.*LP|SLP/i;

function isSlpLike(symbol: string, name: string): boolean {
  if (SLP_RE.test(symbol)) return true;
  if (SUSHI_LP_RE.test(name)) return true;
  // juga tangkap "Sushi LP" di symbol/name
  if (/sushi/i.test(symbol) && /lp/i.test(symbol)) return true;
  if (/sushi/i.test(name) && /lp/i.test(name)) return true;
  return false;
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

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; symbol: string; name: string };
  quoteToken: { address: string; symbol: string; name: string };
  liquidity?: { usd?: number };
  url?: string;
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

const DEXSCREENER_BASE = "https://api.dexscreener.com";

async function discoverSushiswapForChain(
  chain: ChainKey,
  address: string
): Promise<DefiPosition[]> {
  const baseUrl = V2_BASES[chain];
  const slug = CHAINS[chain]?.dexscreenerSlug;
  // BSC tidak ada V2_BASES → graceful [] sesuai spec MVP
  if (!baseUrl || !slug) return [];

  // 1) ambil token balances dari Blockscout, filter SLP-like
  const candidates: string[] = [];
  try {
    const res = await fetchWithTimeout(`${baseUrl}/api/v2/addresses/${address}/token-balances`, {
      timeoutMs: 8_000,
      headers: browserHeaders(baseUrl, `/address/${address}`),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) return [];
    const rows = json as V2TokenBalance[];
    for (const r of rows) {
      const t = r.token;
      const addr = t?.address_hash ?? t?.address;
      if (!addr || !r.value || r.value === "0") continue;
      const sym = t?.symbol?.trim() ?? "";
      const nm = t?.name?.trim() ?? "";
      if (isSlpLike(sym, nm)) candidates.push(addr.toLowerCase());
    }
  } catch {
    return [];
  }

  if (!candidates.length) return [];

  // 2) enrich via DexScreener, filter hanya dexId === sushiswap
  const uniqueLower = [...new Set(candidates.filter(Boolean))];
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
          const dexLower = (pair.dexId ?? "").toLowerCase();
          // strict filter: hanya sushiswap
          if (dexLower !== "sushiswap") continue;

          const poolAddress = pair.pairAddress.toLowerCase();
          if (seenPool.has(poolAddress)) continue;
          seenPool.add(poolAddress);

          const baseAddr = pair.baseToken.address.toLowerCase();
          const quoteAddr = pair.quoteToken.address.toLowerCase();

          let lpTokenAddress: string | null = null;
          if (inputSet.has(poolAddress)) lpTokenAddress = poolAddress;
          else if (inputSet.has(baseAddr)) lpTokenAddress = baseAddr;
          else if (inputSet.has(quoteAddr)) lpTokenAddress = quoteAddr;
          else lpTokenAddress = null;

          const baseSym = pair.baseToken.symbol?.trim() || "UNKNOWN";
          const quoteSym = pair.quoteToken.symbol?.trim() || "UNKNOWN";
          const symbol = `${baseSym}/${quoteSym} SLP`;
          const name = `${baseSym}/${quoteSym} SLP on sushiswap`;

          const reserveUsd =
            typeof pair.liquidity?.usd === "number" && Number.isFinite(pair.liquidity.usd)
              ? pair.liquidity.usd
              : null;

          positions.push({
            chain,
            protocol: "sushiswap",
            poolAddress,
            lpTokenAddress,
            symbol,
            name,
            type: "lp",
            dexId: "sushiswap",
            baseSymbol: baseSym,
            quoteSymbol: quoteSym,
            reserveUsd,
            apy: null,
            logoUrl: null,
            discoverySource: "sushiswap",
          });
        }
      } catch {
        // per chunk graceful
      }
    })
  );

  return positions;
}

export const sushiswapDefiProvider: DefiDiscoveryProvider = {
  id: "sushiswap",
  name: "SushiSwap",
  // Support SEMUA 5 chain — BSC via graceful [] (V2_BASES null), ink/hyperevm/robinhood via Blockscout + DexScreener filter sushiswap
  supportsChain: (c: ChainKey) =>
    c === "base" || c === "bsc" || c === "ink" || c === "hyperevm" || c === "robinhood",
  discoverPositions: async (chain: ChainKey, address: string): Promise<DefiPosition[]> => {
    const isKnownChain =
      chain === "base" || chain === "bsc" || chain === "ink" || chain === "hyperevm" || chain === "robinhood";
    if (!isKnownChain) return [];
    const lower = address.toLowerCase();
    const cacheKey = `defi:sushiswap:${chain}:${lower}`;

    try {
      const { value } = await globalCache.swr<DefiPosition[]>(
        cacheKey,
        async () => {
          try {
            return await discoverSushiswapForChain(chain, lower);
          } catch {
            return [] as DefiPosition[];
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

// Helper untuk testing / reuse
export async function fetchSushiswapPositions(
  chain: ChainKey,
  address: string
): Promise<DefiPosition[]> {
  return discoverSushiswapForChain(chain, address);
}
