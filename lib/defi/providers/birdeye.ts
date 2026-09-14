/**
 * lib/defi/providers/birdeye.ts — DeFi provider Birdeye.
 *
 * Meng- enrich LP positions via Birdeye Wallet API.
 * Endpoint primer: GET https://public-api.birdeye.so/v1/wallet/list?wallet={address}
 * dengan header X-API-KEY + x-chain. Fallback ke portfolio endpoint jika 404/401.
 * Cache: globalCache.swr fresh 30s stale 120s per address.
 * Tidak ada hardcode secret; key diambil dari BIRDEYE_API_KEY (server-only).
 * Graceful fallback [] jika tidak ada key, chain tidak support, atau API error.
 */

import { fetchWithTimeout, globalCache } from "../../cache";
import type { ChainKey } from "../../types";
import type { DefiDiscoveryProvider, DefiPosition } from "../types";

// Birdeye DeFi provider now supports all 5 chains.
// Mapping: base="base", bsc="bsc" (fallback "bnb"), ink="ink", hyperevm="hyperliquid" (fallback "hyperevm"), robinhood="robinhood".
// Graceful fallback [] if Birdeye hasn't yet listed the chain (404/401).
export const BIRDEYE_CHAIN: Record<ChainKey, string | null> = {
  base: "base",
  bsc: "bsc",
  ink: "ink",
  hyperevm: "hyperliquid",
  robinhood: "robinhood",
};

/**
 * Return Birdeye chain slugs to try for a given ChainKey.
 * - base       -> ["base"]
 * - bsc        -> ["bsc","bnb"]  (Birdeye historically uses "bsc" or "bnb")
 * - ink        -> ["ink"]
 * - hyperevm   -> ["hyperliquid","hyperevm"] (HyperEVM 999 — Birdeye may list as "hyperliquid")
 * - robinhood  -> ["robinhood"]
 * Fallback order matters: first slug tried first, second only if first yields 404/empty.
 */
export function birdeyeChainsFor(chain: ChainKey): string[] {
  if (chain === "hyperevm") return ["hyperliquid", "hyperevm"];
  if (chain === "bsc") return ["bsc", "bnb"];
  const primary = BIRDEYE_CHAIN[chain];
  return primary ? [primary] : [];
}

// alias for spec example compatibility
export const chainSlugs = birdeyeChainsFor;

function getBirdeyeKey(): string | null {
  // Hanya key server-only — NEXT_PUBLIC_* tidak dipakai karena ter-bundle ke client JS.
  const k = (process.env.BIRDEYE_API_KEY?.trim() || "") as string;
  return k.length ? k : null;
}

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function isLpLike(item: Record<string, unknown>): boolean {
  const sym = typeof item.symbol === "string" ? item.symbol : "";
  const name = typeof item.name === "string" ? item.name : "";
  const type = typeof item.type === "string" ? item.type : "";
  if (item.isLp === true || item.is_lp === true) return true;
  if (type.toLowerCase() === "lp") return true;
  if (/(?:\bLP\b|UNI-V2|SLP|Cake-LP)/i.test(sym)) return true;
  if (/\bLP\b/i.test(name)) return true;
  // Birdeye kadang menandai liquidity pool via `isLp` atau `category === "lp"`
  const cat = typeof (item as Record<string, unknown>).category === "string"
    ? String((item as Record<string, unknown>).category).toLowerCase()
    : "";
  if (cat === "lp" || cat === "liquidity") return true;
  return false;
}

interface BirdeyeRawItem extends Record<string, unknown> {
  address?: string;
  poolAddress?: string;
  pairAddress?: string;
  lpAddress?: string;
  mint?: string;
  symbol?: string;
  name?: string;
  dex?: string;
  protocol?: string;
  dexId?: string;
  liquidity?: number | string | null;
  reserveUsd?: number | string | null;
  valueUsd?: number | string | null;
  liquidityUsd?: number | string | null;
  priceUsd?: number | string | null;
  baseSymbol?: string;
  quoteSymbol?: string;
  base_symbol?: string;
  quote_symbol?: string;
}

function extractPoolAddress(item: BirdeyeRawItem): string | null {
  const candidates = [
    item.address,
    item.poolAddress,
    item.pairAddress,
    item.lpAddress,
    item.mint,
    (item as Record<string, unknown>).pool_address as string | undefined,
    (item as Record<string, unknown>).pair_address as string | undefined,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("0x") && c.length === 42) return c.toLowerCase();
  }
  return null;
}

function mapBirdeyeItem(chain: ChainKey, item: BirdeyeRawItem): DefiPosition | null {
  const poolAddress = extractPoolAddress(item);
  if (!poolAddress) return null;

  const dexRaw =
    (typeof item.dex === "string" && item.dex) ||
    (typeof item.protocol === "string" && item.protocol) ||
    (typeof item.dexId === "string" && item.dexId) ||
    "birdeye";

  const protocol = dexRaw.trim().toLowerCase() || "birdeye";

  // Coba pecah symbol jadi base/quote bila format "WETH/USDC" atau "WETH-USDC LP"
  const rawSymbol = (typeof item.symbol === "string" && item.symbol.trim()) || "";
  let baseSymbol: string | undefined;
  let quoteSymbol: string | undefined;

  if (rawSymbol) {
    // hilangkan suffix LP
    const withoutLp = rawSymbol.replace(/\s*LP\s*$/i, "").trim();
    const parts = withoutLp.split(/[\/\-]/).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      baseSymbol = parts[0];
      quoteSymbol = parts[1];
    }
  }

  // fallback dari field terpisah
  if (!baseSymbol && typeof item.baseSymbol === "string" && item.baseSymbol.trim()) {
    baseSymbol = item.baseSymbol.trim();
  }
  if (!quoteSymbol && typeof item.quoteSymbol === "string" && item.quoteSymbol.trim()) {
    quoteSymbol = item.quoteSymbol.trim();
  }
  if (!baseSymbol && typeof item.base_symbol === "string" && item.base_symbol.trim()) {
    baseSymbol = item.base_symbol.trim();
  }
  if (!quoteSymbol && typeof item.quote_symbol === "string" && item.quote_symbol.trim()) {
    quoteSymbol = item.quote_symbol.trim();
  }

  const symbol =
    rawSymbol ||
    (baseSymbol && quoteSymbol ? `${baseSymbol}/${quoteSymbol} LP` : `${poolAddress.slice(0, 6)}... LP`);
  const name =
    (typeof item.name === "string" && item.name.trim()) ||
    (baseSymbol && quoteSymbol ? `${baseSymbol}/${quoteSymbol} LP on ${protocol}` : symbol);

  const reserveUsd =
    toNumberOrNull(item.liquidity) ??
    toNumberOrNull(item.reserveUsd) ??
    toNumberOrNull(item.liquidityUsd) ??
    toNumberOrNull(item.valueUsd) ??
    null;

  // Birdeye kadang tidak memberi apy; biarkan null
  const apy = toNumberOrNull((item as Record<string, unknown>).apy);

  const logoUrl =
    (typeof (item as Record<string, unknown>).logoUrl === "string" &&
      String((item as Record<string, unknown>).logoUrl)) ||
    (typeof (item as Record<string, unknown>).logo_url === "string" &&
      String((item as Record<string, unknown>).logo_url)) ||
    (typeof (item as Record<string, unknown>).icon === "string" &&
      String((item as Record<string, unknown>).icon)) ||
    null;

  return {
    chain,
    protocol,
    poolAddress,
    lpTokenAddress: poolAddress,
    symbol,
    name,
    type: "lp",
    dexId: protocol !== "birdeye" ? protocol : null,
    baseSymbol,
    quoteSymbol,
    reserveUsd,
    apy,
    logoUrl,
    discoverySource: "birdeye",
  };
}

function collectItems(json: unknown): BirdeyeRawItem[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;

  // bentuk umum Birdeye: { success: true, data: { items: [...] } } atau { data: [...] }
  const candidates: unknown[] = [];

  const tryPush = (v: unknown) => {
    if (Array.isArray(v)) candidates.push(...v);
  };

  // langsung array?
  if (Array.isArray(json)) return json as BirdeyeRawItem[];

  // data.items
  const data = obj.data as unknown;
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    tryPush(d.items);
    tryPush(d.tokens);
    tryPush(d.data);
    tryPush(d.list);
    tryPush(d.wallet);
    // jika data sendiri array
    if (Array.isArray(data)) tryPush(data);
    // nested data.data.items ?
    if (d.data && typeof d.data === "object") {
      const dd = d.data as Record<string, unknown>;
      tryPush(dd.items);
      tryPush(dd.tokens);
    }
  }

  // root items
  tryPush(obj.items);
  tryPush(obj.tokens);
  tryPush(obj.list);
  tryPush(obj.result);

  // filter yang terlihat seperti token item (punya address/symbol)
  const out = candidates.filter(
    (c) => c && typeof c === "object" && typeof (c as Record<string, unknown>).symbol === "string" || typeof (c as Record<string, unknown>).address === "string" || typeof (c as Record<string, unknown>).mint === "string"
  ) as BirdeyeRawItem[];

  // Jika tidak ada yang ter-filter tapi candidates ada, kembalikan apa adanya bila tampak seperti item
  if (!out.length && candidates.length) {
    const fallback = candidates.filter((c) => c && typeof c === "object") as BirdeyeRawItem[];
    return fallback;
  }

  return out;
}

/**
 * Low-level fetch for a single Birdeye slug.
 * Returns status meta to distinguish 404/401 (not supported) vs 200 empty (supported but no LP).
 */
async function fetchBirdeyeForChainWithStatus(
  birdeyeChain: string,
  address: string,
  apiKey: string
): Promise<{ items: BirdeyeRawItem[]; hadOk: boolean }> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "X-API-KEY": apiKey,
    "x-chain": birdeyeChain,
  };

  // Urutan endpoint coba: primary list, lalu token_list (dengan query chain=), lalu portfolio variants
  // Header X-API-KEY always, x-chain + query chain= for compatibility.
  const urls = [
    `https://public-api.birdeye.so/v1/wallet/list?wallet=${address}`,
    `https://public-api.birdeye.so/v1/wallet/token_list?wallet=${address}&chain=${birdeyeChain}`,
    `https://public-api.birdeye.so/defi/v2/wallet/portfolio?wallet=${address}`,
    `https://public-api.birdeye.so/defi/v3/wallet/portfolio?wallet=${address}`,
  ];

  let hadOk = false;

  for (const url of urls) {
    try {
      const res = await fetchWithTimeout(url, {
        timeoutMs: 8_000,
        headers: url.includes("chain=")
          ? headers
          : { ...headers, "x-chain": birdeyeChain },
        cache: "no-store",
      });
      if (!res.ok) {
        // 401/404/429 -> coba endpoint berikutnya, jangan throw (graceful)
        continue;
      }
      hadOk = true;
      const json = (await res.json()) as unknown;
      const items = collectItems(json);
      if (items.length) return { items, hadOk: true };
      // Jika endpoint mengembalikan sukses tapi tidak ada items, coba endpoint berikutnya
      // (beberapa chain mungkin kosong di endpoint pertama tapi ada di yang lain)
    } catch {
      // network error -> coba endpoint berikutnya
      continue;
    }
  }
  return { items: [], hadOk };
}

// kept for backward compat; wrapper around WithStatus (exported so lint doesn't flag unused)
export async function fetchBirdeyeForChain(
  birdeyeChain: string,
  address: string,
  apiKey: string
): Promise<BirdeyeRawItem[]> {
  const { items } = await fetchBirdeyeForChainWithStatus(birdeyeChain, address, apiKey);
  return items;
}

export const birdeyeDefiProvider: DefiDiscoveryProvider = {
  id: "birdeye",
  name: "Birdeye",
  supportsChain: (c: ChainKey) => Boolean(BIRDEYE_CHAIN[c]),
  discoverPositions: async (chain: ChainKey, address: string): Promise<DefiPosition[]> => {
    const slugs = birdeyeChainsFor(chain);
    if (!slugs.length) return [];

    const apiKey = getBirdeyeKey();
    if (!apiKey) return [];

    const lower = address.toLowerCase();
    const cacheKey = `defi:birdeye:${chain}:${lower}`;

    try {
      const { value } = await globalCache.swr<DefiPosition[]>(
        cacheKey,
        async () => {
          try {
            let rawItems: BirdeyeRawItem[] = [];
            // Loop setiap chainSlug sampai salah satu sukses (tidak 404/401) atau semua gagal.
            // hadOk = true means Birdeye recognizes the slug (HTTP 200 at least one endpoint).
            // If we get items, we use them; if hadOk but empty, we still break (graceful empty).
            for (const slug of slugs) {
              const { items, hadOk } = await fetchBirdeyeForChainWithStatus(slug, lower, apiKey);
              if (items.length) {
                rawItems = items;
                break;
              }
              if (hadOk) {
                // Slug supported, endpoint returned 200 but no items — treat as final empty, don't fallback to next alias.
                rawItems = [];
                break;
              }
              // hadOk false => 404/401 for this slug, try next alias (e.g. hyperliquid -> hyperevm, bsc -> bnb)
            }

            if (!rawItems.length) return [];

            // Filter LP-like saja
            const lpItems = rawItems.filter((it) => isLpLike(it as Record<string, unknown>));
            // Jika filter terlalu ketat dan tidak ada hasil, fallback tampilkan semua yang punya poolAddress valid
            // tapi hanya jika semua items memang tampak seperti LP (jaga noise)
            const candidates = lpItems.length ? lpItems : [];

            if (!candidates.length) return [];

            const out: DefiPosition[] = [];
            const seen = new Set<string>();
            for (const item of candidates) {
              try {
                const pos = mapBirdeyeItem(chain, item);
                if (!pos) continue;
                if (seen.has(pos.poolAddress)) continue;
                seen.add(pos.poolAddress);
                out.push(pos);
              } catch {
                // skip malformed
              }
            }
            return out;
          } catch {
            return [];
          }
        },
        { freshMs: 30_000, staleMs: 120_000 }
      );
      return value;
    } catch {
      return [];
    }
  },
};

// Helper ekspor untuk testing / reuse
export async function fetchBirdeyeLpPositions(
  chain: ChainKey,
  address: string
): Promise<DefiPosition[]> {
  return birdeyeDefiProvider.discoverPositions(chain, address);
}
