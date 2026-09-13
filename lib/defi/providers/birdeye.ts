/**
 * lib/defi/providers/birdeye.ts — DeFi provider Birdeye.
 *
 * Meng- enrich LP positions via Birdeye Wallet API.
 * Endpoint primer: GET https://public-api.birdeye.so/v1/wallet/list?wallet={address}
 * dengan header X-API-KEY + x-chain. Fallback ke portfolio endpoint jika 404/401.
 * Cache: globalCache.swr fresh 30s stale 120s per address.
 * Tidak ada hardcode secret; key diambil dari BIRDEYE_API_KEY atau NEXT_PUBLIC_BIRDEYE_API_KEY.
 * Graceful fallback [] jika tidak ada key, chain tidak support, atau API error.
 */

import { fetchWithTimeout, globalCache } from "../../cache";
import type { ChainKey } from "../../types";
import type { DefiDiscoveryProvider, DefiPosition } from "../types";

// Birdeye hanya support subset chain untuk MVP: base & bsc.
// hyperevm / ink / robinhood belum tersedia di Birdeye — graceful [].
const BIRDEYE_CHAIN: Record<ChainKey, string | null> = {
  base: "base",
  bsc: "bsc",
  hyperevm: null,
  ink: null,
  robinhood: null,
};

function getBirdeyeKey(): string | null {
  const k =
    (process.env.BIRDEYE_API_KEY?.trim() ||
      process.env.NEXT_PUBLIC_BIRDEYE_API_KEY?.trim() ||
      "") as string;
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

async function fetchBirdeyeForChain(
  birdeyeChain: string,
  address: string,
  apiKey: string
): Promise<BirdeyeRawItem[]> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "X-API-KEY": apiKey,
    "x-chain": birdeyeChain,
  };

  // Urutan endpoint coba: primary list, lalu token_list, lalu portfolio/portfolio
  const urls = [
    `https://public-api.birdeye.so/v1/wallet/list?wallet=${address}`,
    `https://public-api.birdeye.so/v1/wallet/token_list?wallet=${address}&chain=${birdeyeChain}`,
    `https://public-api.birdeye.so/defi/v2/wallet/portfolio?wallet=${address}`,
    `https://public-api.birdeye.so/defi/v3/wallet/portfolio?wallet=${address}`,
  ];

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
        // 401/404/429 -> coba endpoint berikutnya, jangan throw
        continue;
      }
      const json = (await res.json()) as unknown;
      const items = collectItems(json);
      if (items.length) return items;
      // Jika endpoint mengembalikan sukses tapi tidak ada items, coba endpoint berikutnya
      // (beberapa chain mungkin kosong di endpoint pertama tapi ada di yang lain)
    } catch {
      // network error -> coba endpoint berikutnya
      continue;
    }
  }
  return [];
}

export const birdeyeDefiProvider: DefiDiscoveryProvider = {
  id: "birdeye",
  name: "Birdeye",
  supportsChain: (c: ChainKey) => Boolean(BIRDEYE_CHAIN[c]),
  discoverPositions: async (chain: ChainKey, address: string): Promise<DefiPosition[]> => {
    const birdeyeChain = BIRDEYE_CHAIN[chain];
    if (!birdeyeChain) return [];

    const apiKey = getBirdeyeKey();
    if (!apiKey) return [];

    const lower = address.toLowerCase();
    const cacheKey = `defi:birdeye:${chain}:${lower}`;

    try {
      const { value } = await globalCache.swr<DefiPosition[]>(
        cacheKey,
        async () => {
          try {
            const rawItems = await fetchBirdeyeForChain(birdeyeChain, lower, apiKey);
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
