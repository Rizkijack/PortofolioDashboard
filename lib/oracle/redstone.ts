/**
 * lib/oracle/redstone.ts — Tier 2 API (median multi-exchange) + Tier 1 push feed Ink.
 * Catatan: API RedStone WAJIB provider=redstone-primary-prod (tanpa itu HTTP 500).
 */

import { formatUnits, parseAbi } from "viem";
import { fetchWithTimeout, globalCache } from "../cache";
import { withFailover } from "../rpc";
import { MULTICALL3 } from "../chains";
import type { ChainKey, PriceQuote } from "../types";

const API = "https://api.redstone.finance/prices";

interface RedstonePrice {
  symbol: string;
  provider: string;
  value: number;
}

export async function fetchRedstoneApi(
  symbols: string[]
): Promise<Map<string, { usd: number; updatedAt: number }>> {
  const out = new Map<string, { usd: number; updatedAt: number }>();
  if (!symbols.length) return out;

  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()))];
  const key = `redstone:api:${uniq.sort().join(",")}`;
  try {
    const { value } = await globalCache.swr(
      key,
      async () => {
        const res = await fetchWithTimeout(
          `${API}?symbols=${uniq.join(",")}&provider=redstone-primary-prod`,
          { timeoutMs: 12_000, headers: { accept: "application/json" } }
        );
        if (!res.ok) throw new Error(`redstone ${res.status}`);
        return (await res.json()) as Record<string, RedstonePrice>;
      },
      { freshMs: 5_000, staleMs: 60_000 }
    );
    const now = Date.now();
    for (const [sym, p] of Object.entries(value)) {
      // M3: pakai timestamp provider jika ada; else now tapi tandai staleness di konsumen
      const rawTs = (p as { timestamp?: number; timestampMs?: number })?.timestamp;
      const tsMs = typeof rawTs === "number" ? (rawTs < 1e12 ? rawTs * 1000 : rawTs) : now;
      if (typeof p?.value === "number" && Number.isFinite(p.value) && p.value > 0) {
        out.set(sym.toUpperCase(), { usd: p.value, updatedAt: tsMs });
      }
    }
  } catch {
    /* kosong → tier berikutnya */
  }
  return out;
}

export const PUSH_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

/** Push feed RedStone (Chainlink-compatible) di Ink — sumber: docs.inkonchain.com */
export const REDSTONE_PUSH: Partial<Record<ChainKey, Array<{ pair: string; address: string }>>> = {
  ink: [
    { pair: "ETH / USD", address: "0xe5867B1d421f0b52697F16e2ac437e87d66D5fbF" },
    { pair: "BTC / USD", address: "0x13433B1949d9141Be52Ae13Ad7e7E4911228414e" },
    { pair: "USDC / USD", address: "0x58fa68A373956285dDfb340EDf755246f8DfCA16" },
    { pair: "USDT / USD", address: "0xb4fe9028A4D4D8B3d00e52341F2BB0798860532C" },
    { pair: "SOL / USD", address: "0xD15862FC3D5407A03B696548b6902D6464A69b8c" },
  ],
};

export interface PushRead {
  pair: string;
  address: string;
  usd: number | null;
  decimals: number;
  updatedAt: number;
  error?: string;
}

export async function readRedstonePush(
  chain: ChainKey,
  symbols: string[]
): Promise<Map<string, PushRead>> {
  const out = new Map<string, PushRead>();
  const feeds = REDSTONE_PUSH[chain];
  if (!feeds?.length) return out;

  const wanted = symbols
    .map((s) => {
      const up = s.toUpperCase();
      const f =
        feeds.find((x) => x.pair.toUpperCase() === `${up} / USD`) ??
        feeds.find((x) => x.pair.toUpperCase().startsWith(`${up} `));
      return f ? { symbol: up, feed: f } : null;
    })
    .filter((x): x is { symbol: string; feed: { pair: string; address: string } } => !!x);

  if (!wanted.length) return out;

  const contracts = wanted.flatMap(({ feed }) => [
    { address: feed.address as `0x${string}`, abi: PUSH_ABI, functionName: "latestRoundData" as const },
    { address: feed.address as `0x${string}`, abi: PUSH_ABI, functionName: "decimals" as const },
  ]);

  try {
    const { value: results } = await withFailover(chain, (client) =>
      client.multicall({ multicallAddress: MULTICALL3, allowFailure: true, contracts })
    );

    for (let i = 0; i < wanted.length; i++) {
      const { symbol, feed } = wanted[i];
      const lr = results[i * 2];
      const dc = results[i * 2 + 1];
      if (lr?.status === "success" && dc?.status === "success") {
        const round = lr.result as readonly [bigint, bigint, bigint, bigint, bigint];
        const answer = round[1];
        const updatedAt = Number(round[3]);
        const decimals = Number(dc.result as number);
        let usd: number | null = null;
        try {
          const parsed = parseFloat(formatUnits(answer, decimals));
          usd = Number.isFinite(parsed) ? parsed : null;
        } catch {
          usd = null;
        }
        const sane = usd !== null && usd > 0 && updatedAt > 1_600_000_000;
        out.set(symbol, {
          pair: feed.pair,
          address: feed.address,
          usd: sane ? usd! : null,
          decimals,
          updatedAt: sane ? updatedAt * 1000 : 0,
          error: sane ? undefined : "implausible push value",
        });
      } else {
        out.set(symbol, {
          pair: feed.pair,
          address: feed.address,
          usd: null,
          decimals: 8,
          updatedAt: 0,
          error: "push read failed",
        });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    for (const { symbol, feed } of wanted) {
      out.set(symbol, {
        pair: feed.pair,
        address: feed.address,
        usd: null,
        decimals: 8,
        updatedAt: 0,
        error: msg.slice(0, 160),
      });
    }
  }

  return out;
}

export function pushToQuote(read: PushRead, heartbeatSec = 86_400): PriceQuote {
  const fetchedAt = Date.now();
  const ageMs = read.updatedAt ? fetchedAt - read.updatedAt : 0;
  return {
    usd: read.usd,
    source: "redstone",
    updatedAt: read.updatedAt,
    fetchedAt,
    ageMs,
    stale: !read.updatedAt || ageMs > heartbeatSec * 2 * 1000,
    change24h: null,
  };
}
