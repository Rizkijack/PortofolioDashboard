/**
 * lib/oracle/index.ts — resolver harga berlapis.
 *
 * PRIORITAS:
 *   1. Chainlink on-chain   (Tier 1)
 *   2. RedStone push (Ink)  (Tier 1 pengganti)
 *   3. Binance stream       (Tier 2, sub-detik, aset mayor)
 *   4. RedStone API         (Tier 2, median multi-exchange)
 *   5. DexScreener          (Tier 3, long-tail)
 *   6. Blockscout rate      (Tier 3, token Robinhood)
 *
 * Aturan: tidak ada harga → `usd: null`. BUKAN 0, BUKAN karangan.
 */

import type { ChainKey, PriceQuote, PriceSource } from "../types";
import { readChainlink, toQuote as clQuote } from "./chainlink";
import { readRedstonePush, pushToQuote, fetchRedstoneApi } from "./redstone";
import { ensureStream, getStreamPrice } from "./binance";

/** Aset mayor yang tersedia di stream Binance. */
function streamQuote(symbol: string): PriceQuote | null {
  ensureStream();
  const t = getStreamPrice(symbol);
  if (!t) return null;
  const fetchedAt = Date.now();
  return {
    usd: t.usd,
    source: "binance-ws",
    updatedAt: t.updatedAt,
    fetchedAt,
    ageMs: fetchedAt - t.updatedAt,
    stale: false,
    change24h: t.change24h,
  };
}

/** Ambang penerimaan harga on-chain (heartbeat Chainlink = 24 jam). */
const ONCHAIN_MAX_AGE_MS = 30 * 60 * 60 * 1000; // 30 jam

function pickBetter(a: PriceQuote | null, b: PriceQuote | null): PriceQuote | null {
  if (!a) return b;
  if (!b) return a;
  if (a.usd === null) return b;
  if (b.usd === null) return a;
  return a;
}

export async function resolveQuotes(
  chain: ChainKey,
  tokens: Array<{ address: string; symbol: string; isNative?: boolean }>
): Promise<Map<string, PriceQuote>> {
  const out = new Map<string, PriceQuote>();
  if (!tokens.length) return out;

  const symbols = [...new Set(tokens.map((t) => t.symbol.toUpperCase()).filter(Boolean))];

  const [chainlink, redstonePush, redstoneApi] = await Promise.all([
    readChainlink(chain, symbols).catch(() => new Map()),
    readRedstonePush(chain, symbols).catch(() => new Map()),
    fetchRedstoneApi(symbols).catch(() => new Map()),
  ]);

  for (const t of tokens) {
    const sym = t.symbol.toUpperCase();
    const key = t.address.toLowerCase();

    const cl = chainlink.get(sym);
    const chainlinkQ: PriceQuote | null = cl && cl.usd !== null && cl.usd > 0 ? clQuote(cl) : null;

    const rsPush = redstonePush.get(sym);
    const pushQ: PriceQuote | null =
      rsPush && rsPush.usd !== null && rsPush.usd > 0 ? pushToQuote(rsPush) : null;

    // Tier 1 — on-chain (utamakan yang masih dalam jendela heartbeat)
    let best: PriceQuote | null = null;
    for (const q of [chainlinkQ, pushQ]) {
      if (q && q.usd !== null && q.ageMs <= ONCHAIN_MAX_AGE_MS) {
        best = pickBetter(best, q);
        break;
      }
    }
    if (!best) best = pickBetter(chainlinkQ, pushQ);

    // Tier 2 — stream Binance bila on-chain absen/basi
    if (!best || best.usd === null || best.stale) {
      const streamQ = streamQuote(sym);
      if (streamQ && streamQ.usd !== null) best = streamQ;
    }

    // Tier 2b — RedStone API
    if (!best || best.usd === null) {
      const api = redstoneApi.get(sym);
      if (api) {
        const fetchedAt = Date.now();
        best = {
          usd: api.usd,
          source: "redstone-api",
          updatedAt: api.updatedAt,
          fetchedAt,
          ageMs: fetchedAt - api.updatedAt,
          stale: false,
          change24h: null,
        };
      }
    }

    out.set(key, best ?? emptyQuote());
  }

  return out;
}

function emptyQuote(): PriceQuote {
  return {
    usd: null,
    source: "none" as PriceSource,
    updatedAt: 0,
    fetchedAt: Date.now(),
    ageMs: 0,
    stale: true,
    change24h: null,
  };
}

/** Lengkapi yang masih kosong dengan DexScreener (Tier 3). */
export async function fillFromDexScreener(
  chain: ChainKey,
  tokens: Array<{ address: string; symbol: string }>,
  current: Map<string, PriceQuote>
): Promise<void> {
  const need = tokens.filter((t) => {
    const q = current.get(t.address.toLowerCase());
    return !q || q.usd === null;
  });
  if (!need.length) return;

  const { fetchPairs, pairToQuote } = await import("./dexscreener");
  try {
    const pairs = await fetchPairs(
      chain,
      need.map((t) => t.address)
    );
    for (const t of need) {
      const pair = pairs.get(t.address.toLowerCase());
      if (!pair) continue;
      const q = pairToQuote(pair);
      if (q.usd !== null) current.set(t.address.toLowerCase(), q);
    }
  } catch {
    /* biarkan null */
  }
}

export { streamStatus, getTicks, ensureStream, waitForTicks } from "./binance";
