/**
 * lib/history.ts — Historical networth aggregator (MVP tanpa DB).
 *
 * Ambil portfolio saat ini, fetch historical price per token, agregasi jadi
 * networth timeseries daily. Cache via globalCache SWR fresh 60s stale 300s.
 */

import { fetchPortfolio } from "./portfolio";
import { CHAIN_ORDER } from "./chains";
import type { ChainKey, TokenBalance } from "./types";
import { globalCache, fetchWithTimeout } from "./cache";

export type HistoryRange = "7d" | "30d" | "90d";

export interface HistoryPoint {
  /** epoch ms */
  t: number;
  /** USD networth */
  value: number;
}

export interface HistoryResponse {
  points: HistoryPoint[];
  range: HistoryRange;
  fetchedAt: number;
  /** true bila semua harga volatile fallback flat */
  limited?: boolean;
  /** total saat ini */
  currentValue?: number | null;
}

// ── helpers: range → days ──

export function daysForRange(r: HistoryRange): number {
  if (r === "30d") return 30;
  if (r === "90d") return 90;
  return 7;
}

function timestampsForRange(range: HistoryRange, now = Date.now()): number[] {
  const days = daysForRange(range);
  const dayMs = 24 * 60 * 60 * 1000;
  const start = now - (days - 1) * dayMs;
  const out: number[] = [];
  for (let i = 0; i < days; i++) out.push(start + i * dayMs);
  // ensure last is exactly now for crosshair realism
  if (out.length) out[out.length - 1] = now;
  return out;
}

// ── stable detection & coingecko mapping ──

const STABLE_EXPLICIT = new Set([
  "USDC",
  "USDT",
  "USDS",
  "USDG",
  "BUSD",
  "DAI",
  "USDE",
  "USD₮0",
  "USDT0",
  "U",
  "SYRUPUSDG",
  "SGOV",
  // HyperEVM / Base variants
  "USD",
]);

function isStableSymbol(sym: string): boolean {
  const up = sym.toUpperCase().trim();
  if (STABLE_EXPLICIT.has(up)) return true;
  // catch USD-peg wrappers like "USDt0", "USDG", SYRUPUSDG already, but generic
  if (up.includes("USD") && !["WETH", "WBTC", "CBBTC"].includes(up)) {
    // avoid false positive for non-stable that contains USD string? Rare.
    // Stables are almost always 1 USD ±.
    // Keep heuristic: if starts with USD or ends with USD is stable.
    if (up.startsWith("USD") || up.endsWith("USD") || up === "U") return true;
  }
  return false;
}

const SYMBOL_TO_COINGECKO: Record<string, string> = {
  ETH: "ethereum",
  WETH: "ethereum",
  BTC: "bitcoin",
  WBTC: "wrapped-bitcoin",
  CBBTC: "bitcoin",
  BTCB: "bitcoin",
  BNB: "binancecoin",
  WBNB: "binancecoin",
  HYPE: "hyperliquid",
  SOL: "solana",
  LINK: "chainlink",
  DOGE: "dogecoin",
  XRP: "ripple",
  OP: "optimism",
  ARB: "arbitrum",
  DAI: "dai",
  "USD-COIN": "usd-coin",
  USDC: "usd-coin",
  USDT: "tether",
  BUSD: "binance-usd",
  // stock-like robinhood tokens -> no coingecko, will flat
};

function coingeckoIdForSymbol(sym: string): string | null {
  const up = sym.toUpperCase().trim();
  return SYMBOL_TO_COINGECKO[up] ?? null;
}

// ── DefiLlama chain map ──

const LLAMA_CHAIN_MAP: Partial<Record<ChainKey, string>> = {
  base: "base",
  bsc: "bsc",
  hyperevm: "hyperliquid",
  // robinhood & ink belum support di llama.fi (fallback flat)
};

async function fetchCoingeckoMarketChart(
  id: string,
  days: number
): Promise<number[][] | null> {
  const key = `cg:chart:${id}:${days}`;
  try {
    const { value } = await globalCache.swr<number[][]>(
      key,
      async () => {
        const res = await fetchWithTimeout(
          `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}`,
          { timeoutMs: 3500, headers: { accept: "application/json" } }
        );
        if (!res.ok) throw new Error(`cg ${res.status}`);
        const json = (await res.json()) as { prices?: number[][] };
        const prices = json.prices ?? [];
        if (!Array.isArray(prices) || prices.length === 0) throw new Error("cg empty");
        return prices;
      },
      { freshMs: 120_000, staleMs: 600_000 }
    );
    if (!value || !Array.isArray(value) || value.length === 0) return null;
    return value;
  } catch {
    return null;
  }
}

async function fetchLlamaChart(
  chain: ChainKey,
  addr: string,
  // days param kept for cache key stability, llama returns full range
  days: number
): Promise<number[][] | null> {
  const slug = LLAMA_CHAIN_MAP[chain];
  if (!slug) return null;
  const key = `llama:chart:${slug}:${addr.toLowerCase()}:${days}`;
  try {
    const { value } = await globalCache.swr<number[][] | null>(
      key,
      async () => {
        const url = `https://coins.llama.fi/chart/${slug}:${addr}`;
        const res = await fetchWithTimeout(url, {
          timeoutMs: 3500,
          headers: { accept: "application/json" },
        });
        if (!res.ok) throw new Error(`llama ${res.status}`);
        const json = (await res.json()) as unknown as Record<string, unknown>;
        // shape: { coins: { "base:0x...": { prices: [...] } } }
        const coins = (json as { coins?: Record<string, { prices?: unknown[] }> })?.coins;
        if (coins) {
          const firstKey = Object.keys(coins)[0];
          const coin = firstKey ? coins[firstKey] : undefined;
          const prices = coin?.prices as unknown[] | undefined;
          if (prices && prices.length) {
            const first = prices[0] as unknown;
            if (typeof first === "object" && first !== null && "timestamp" in (first as Record<string, unknown>)) {
              return (prices as Array<{ timestamp: number; price: number }>).map((p) => [
                p.timestamp * 1000,
                p.price,
              ]);
            }
            if (Array.isArray(first)) {
              // [timestampSec, price]
              return (prices as number[][]).map((r) => [r[0] * 1000, r[1]]);
            }
          }
        }
        return null;
      },
      { freshMs: 120_000, staleMs: 600_000 }
    );
    if (!value || !Array.isArray(value) || value.length === 0) return null;
    return value;
  } catch {
    return null;
  }
}

function mapPricesToDaily(raw: number[][], targets: number[]): (number | null)[] {
  if (!raw || raw.length === 0) return targets.map(() => null);
  const sorted = [...raw].sort((a, b) => a[0] - b[0]);
  return targets.map((t) => {
    let best: number | null = null;
    // sorted asc, iterate until > t
    for (let i = 0; i < sorted.length; i++) {
      const ts = sorted[i][0];
      const price = sorted[i][1];
      if (!Number.isFinite(price) || price <= 0) continue;
      if (ts <= t) {
        best = price;
      } else {
        break;
      }
    }
    if (best === null) {
      // no earlier point, take earliest finite
      for (const [, p] of sorted) if (Number.isFinite(p) && p > 0) return p;
      return null;
    }
    return best;
  });
}

interface TokenInfo {
  chain: ChainKey;
  address: string;
  symbol: string;
  balance: string;
  currentPrice: number | null;
  token: TokenBalance;
}

async function buildHistory(address: string, range: HistoryRange): Promise<HistoryResponse> {
  const fetchedAt = Date.now();
  const targets = timestampsForRange(range, fetchedAt);
  const days = daysForRange(range);

  let portfolio: Awaited<ReturnType<typeof fetchPortfolio>> | null = null;
  try {
    // Beri batas waktu maksimal 12s untuk portfolio scan di history agar tidak timeout gateway
    portfolio = await Promise.race([
      fetchPortfolio(address, [...CHAIN_ORDER], { includeZero: false }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("portfolio timeout for history")), 12_000)
      ),
    ]);
  } catch {
    // graceful fallback: flat points as spec
    const now = Date.now();
    return {
      points: targets.map((t) => ({ t, value: 0 })),
      range,
      fetchedAt,
      limited: true,
      currentValue: 0,
    };
  }

  const allTokens: TokenBalance[] = (portfolio?.chains ?? []).flatMap((c) => c.tokens ?? []);
  // filter non-zero valueUsd (tanpa zero) and finite balance
  const candidates: TokenInfo[] = allTokens
    .filter((t) => t.valueUsd !== null && t.valueUsd > 0 && Number(t.balance) > 0 && t.price.usd !== null)
    .map((t) => ({
      chain: t.chain,
      address: t.address,
      symbol: t.symbol,
      balance: t.balance,
      currentPrice: t.price.usd,
      token: t,
    }));

  const currentTotal = portfolio?.totalValueUsd ?? candidates.reduce((s, c) => s + (Number(c.balance) * (c.currentPrice ?? 0)), 0);

  if (candidates.length === 0) {
    // no priced holdings -> flat 0 or flat currentTotal (0)
    const points = targets.map((t) => ({ t, value: currentTotal ?? 0 }));
    return { points, range, fetchedAt, limited: true, currentValue: currentTotal ?? 0 };
  }

  // avoid hammering: cap to top 10 by valueUsd to stay fast & within rate limits
  candidates.sort((a, b) => (b.token.valueUsd ?? 0) - (a.token.valueUsd ?? 0));
  const pricedTokens = candidates.slice(0, 10);
  const rest = candidates.slice(10);
  // rest will be flat current price (stable assumption)

  const pricesByKey = new Map<string, (number | null)[]>();
  let successfulHistorical = 0;

  await Promise.all(
    pricedTokens.map(async (ti) => {
      const key = `${ti.chain}:${ti.address.toLowerCase()}`;
      if (isStableSymbol(ti.symbol)) {
        pricesByKey.set(key, targets.map(() => 1));
        // stable flat is not counted as historical success but not limited
        return;
      }
      const cgId = coingeckoIdForSymbol(ti.symbol);
      if (cgId) {
        const raw = await fetchCoingeckoMarketChart(cgId, days);
        if (raw && raw.length) {
          const mapped = mapPricesToDaily(raw, targets);
          // verify at least one finite
          if (mapped.some((v) => v !== null && Number.isFinite(v) && (v as number) > 0)) {
            pricesByKey.set(key, mapped);
            successfulHistorical++;
            return;
          }
        }
      }
      // try llama
      const rawLlama = await fetchLlamaChart(ti.chain, ti.address, days);
      if (rawLlama && rawLlama.length) {
        const mapped = mapPricesToDaily(rawLlama, targets);
        if (mapped.some((v) => v !== null && Number.isFinite(v) && (v as number) > 0)) {
          pricesByKey.set(key, mapped);
          successfulHistorical++;
          return;
        }
      }
      // fallback flat current price
      pricesByKey.set(key, targets.map(() => ti.currentPrice ?? 1));
    })
  );

  // rest tokens flat
  for (const ti of rest) {
    const key = `${ti.chain}:${ti.address.toLowerCase()}`;
    pricesByKey.set(key, targets.map(() => ti.currentPrice ?? 1));
  }

  // aggregate
  const points: HistoryPoint[] = targets.map((t, idx) => {
    let sum = 0;
    for (const ti of candidates) {
      const key = `${ti.chain}:${ti.address.toLowerCase()}`;
      const arr = pricesByKey.get(key);
      const bal = Number(ti.balance);
      if (!Number.isFinite(bal) || bal === 0) continue;
      let price: number | null = null;
      if (arr && arr[idx] !== null && arr[idx] !== undefined) price = arr[idx] as number;
      if (price === null || !Number.isFinite(price) || price <= 0) price = ti.currentPrice;
      if (price === null || !Number.isFinite(price)) continue;
      sum += bal * price;
    }
    // guard: if sum is 0 but currentTotal exists (should not), use current
    if (!Number.isFinite(sum)) sum = 0;
    return { t, value: sum };
  });

  // edge: jika semua fallback flat, points akan flat identik -> set limited
  const volatileCount = pricedTokens.filter((t) => !isStableSymbol(t.symbol)).length;
  const limited = volatileCount > 0 && successfulHistorical === 0;

  // ensure sorted asc
  points.sort((a, b) => a.t - b.t);

  // graceful fallback jika historical tidak tersedia: spec minta 2 point flat minimal, but we already have daily flat
  if (limited && points.length >= 2) {
    // keep daily flat (valid), don't reduce to 2
  }

  return { points, range, fetchedAt, limited, currentValue: currentTotal ?? null };
}

export async function fetchHistory(address: string, range: HistoryRange): Promise<HistoryResponse> {
  const normalized = address.toLowerCase();
  const allowed: HistoryRange[] = ["7d", "30d", "90d"];
  const safeRange: HistoryRange = (allowed as string[]).includes(range) ? range : "7d";
  const key = `history:${normalized}:${safeRange}`;
  const { value } = await globalCache.swr<HistoryResponse>(
    key,
    () => buildHistory(address, safeRange),
    { freshMs: 60_000, staleMs: 300_000 }
  );
  return value;
}
