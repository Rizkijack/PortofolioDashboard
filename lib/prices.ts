/**
 * lib/prices.ts — util harga untuk endpoint & ticker UI.
 *
 * Dua bentuk input:
 *   1. `ids` gaya lama: slug CoinGecko (ethereum, usd-coin, bitcoin, binancecoin,
 *      hyperliquid) → dipetakan ke simbol aset lalu diresolusi lewat
 *      Binance stream + RedStone API. Tidak ada harga fallback statis.
 *   2. `ids` kanonik: "chain:0xalamat" → resolusi penuh (Chainlink → … → DEX).
 */

import { CHAINS, chainByKey, parseChainKeys } from "./chains";
import { NATIVE_ADDRESS } from "./types";
import type { ChainKey, PriceQuote } from "./types";
import { resolveQuotes, fillFromDexScreener, streamStatus, waitForTicks } from "./oracle";
import { fetchRedstoneApi } from "./oracle/redstone";
import { ensureStream, getStreamPrice } from "./oracle/binance";
import { globalCache } from "./cache";

// ── kompatibilitas hook UI lama ──
export type PriceMap = Record<
  string,
  { usd: number | null; change24h?: number | null; updatedAt: number; source?: string }
>;
export const PRICE_POLL_MS = 4000;

/** slug CoinGecko → simbol aset yang dikenal oracle kita. */
const SLUG_TO_SYMBOL: Record<string, string> = {
  ethereum: "ETH",
  weth: "ETH",
  "usd-coin": "USDC",
  tether: "USDT",
  binancecoin: "BNB",
  bitcoin: "BTC",
  wbtc: "BTC",
  hyperliquid: "HYPE",
  solana: "SOL",
  chainlink: "LINK",
  dogecoin: "DOGE",
  ripple: "XRP",
  optimism: "OP",
  dai: "DAI",
  "binance-usd": "BUSD",
};

export function slugToSymbol(slug: string): string | null {
  return SLUG_TO_SYMBOL[slug.toLowerCase()] ?? null;
}

export function isCanonicalId(id: string): boolean {
  return /^[a-z]+:0x[a-fA-F0-9]{40}$/.test(id.trim());
}

export interface PriceRequestItem {
  chain: ChainKey;
  address: string;
  symbol: string;
  isNative?: boolean;
}

function isNativeAddress(addr: string): boolean {
  const l = addr.toLowerCase();
  return l === NATIVE_ADDRESS.toLowerCase() || l === "0x0000000000000000000000000000000000000000";
}

export function parsePriceIds(ids: string): PriceRequestItem[] {
  const out: PriceRequestItem[] = [];
  for (const raw of ids.split(",")) {
    const item = raw.trim();
    if (!item) continue;
    const idx = item.indexOf(":");
    if (idx <= 0) continue;
    const chain = item.slice(0, idx).trim().toLowerCase();
    const address = item.slice(idx + 1).trim();
    const chainMeta = chainByKey(chain);
    if (!chainMeta) continue;
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) continue;
    const isNative = isNativeAddress(address);
    out.push({
      chain: chain as ChainKey,
      address,
      symbol: isNative ? chainMeta.nativeSymbol : "",
      isNative,
    });
  }
  return out;
}

/**
 * Harga untuk slug gaya CoinGecko (dipakai ticker UI).
 * Jalur: Binance stream (sub-detik) → RedStone API → DexScreener Base USDC pair.
 */
export async function fetchSlugQuotes(slugs: string[]): Promise<PriceMap> {
  if (!slugs.length) return {};
  const wanted = new Map<string, string>(); // slug → symbol
  for (const s of slugs) {
    const sym = slugToSymbol(s);
    if (sym) wanted.set(s.toLowerCase(), sym);
  }
  if (!wanted.size) return {};

  // M6 fix: cache 4s & skip wait jika stream sudah punya ticks
  const cacheKey = `slug-quotes:${[...wanted.keys()].sort().join(",")}`;
  const { value } = await globalCache.swr(
    cacheKey,
    async () => {
      ensureStream();
      const st = streamStatus();
      const connected = st?.connected ?? false;
      if (!connected) await waitForTicks(2500);
      const symbols = [...new Set(wanted.values())];
      const redstone = await fetchRedstoneApi(symbols).catch(() => new Map<string, { usd: number; updatedAt: number }>());
      const snapshot: PriceMap = {};
      for (const [slug, sym] of wanted) {
        const stream = getStreamPrice(sym);
        if (stream) snapshot[slug] = { usd: stream.usd, change24h: stream.change24h, updatedAt: stream.updatedAt, source: "binance-ws" };
        else {
          const rs = redstone.get(sym);
          if (rs) snapshot[slug] = { usd: rs.usd, change24h: null, updatedAt: rs.updatedAt, source: "redstone-api" };
          else snapshot[slug] = { usd: null, change24h: null, updatedAt: 0, source: "none" };
        }
      }
      return snapshot;
    },
    { freshMs: 4_000, staleMs: 15_000 }
  );
  return value;
}

/** Harga untuk id kanonik "chain:address" (resolusi berlapis penuh). */
export async function fetchQuotesFor(
  items: PriceRequestItem[]
): Promise<{ quotes: Record<string, PriceQuote>; missing: string[] }> {
  const quotes: Record<string, PriceQuote> = {};
  const missing: string[] = [];

  const byChain = new Map<ChainKey, PriceRequestItem[]>();
  for (const it of items) {
    const list = byChain.get(it.chain) ?? [];
    list.push(it);
    byChain.set(it.chain, list);
  }

  await Promise.all(
    [...byChain.entries()].map(async ([chain, list]) => {
      const withSymbol = list.filter((i) => i.symbol);
      const resolved =
        withSymbol.length > 0
          ? await resolveQuotes(
              chain,
              withSymbol.map((i) => ({ address: i.address, symbol: i.symbol, isNative: i.isNative }))
            )
          : new Map<string, PriceQuote>();

      await fillFromDexScreener(
        chain,
        list.map((i) => ({ address: i.address, symbol: i.symbol })),
        resolved
      );

      for (const i of list) {
        const key = `${chain}:${i.address.toLowerCase()}`;
        const q = resolved.get(i.address.toLowerCase());
        if (q) quotes[key] = q;
        if (!q || q.usd === null) missing.push(key);
      }
    })
  );

  return { quotes, missing };
}

export function chainList(): ChainKey[] {
  return parseChainKeys(null);
}

export { CHAINS, streamStatus, ensureStream };
