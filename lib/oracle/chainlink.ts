/**
 * lib/oracle/chainlink.ts — Tier 1: on-chain push oracle via Multicall3.
 * Satu RPC call untuk N feed (latestRoundData + decimals).
 */

import { parseAbi } from "viem";
import { withFailover } from "../rpc";
import { MULTICALL3 } from "../chains";
import { findFeed, type ChainlinkFeed } from "./chainlink-feeds";
import type { ChainKey, PriceQuote } from "../types";

export const AGGREGATOR_ABI = parseAbi([
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
  "function decimals() view returns (uint8)",
]);

const STALE_FACTOR = 2;

export interface ChainlinkRead {
  pair: string;
  address: string;
  usd: number | null;
  decimals: number;
  updatedAt: number;
  error?: string;
}

export async function readChainlink(
  chain: ChainKey,
  symbols: string[]
): Promise<Map<string, ChainlinkRead>> {
  const out = new Map<string, ChainlinkRead>();

  const wanted: Array<{ symbol: string; feed: ChainlinkFeed }> = [];
  for (const s of symbols) {
    const feed = findFeed(chain, s);
    if (feed) wanted.push({ symbol: s.toUpperCase(), feed });
  }
  if (!wanted.length) return out;

  const contracts = wanted.flatMap(({ feed }) => [
    { address: feed.address as `0x${string}`, abi: AGGREGATOR_ABI, functionName: "latestRoundData" as const },
    { address: feed.address as `0x${string}`, abi: AGGREGATOR_ABI, functionName: "decimals" as const },
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
        const usd = Number(answer) / 10 ** decimals;
        const sane = Number.isFinite(usd) && usd > 0 && updatedAt > 1_600_000_000;
        out.set(symbol, {
          pair: feed.pair,
          address: feed.address,
          usd: sane ? usd : null,
          decimals,
          updatedAt: sane ? updatedAt * 1000 : 0,
          error: sane ? undefined : "implausible oracle value",
        });
      } else {
        out.set(symbol, {
          pair: feed.pair,
          address: feed.address,
          usd: null,
          decimals: feed.declaredDecimals,
          updatedAt: 0,
          error: `multicall: lr=${lr?.status ?? "?"} dec=${dc?.status ?? "?"}`,
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
        decimals: feed.declaredDecimals,
        updatedAt: 0,
        error: msg.slice(0, 160),
      });
    }
  }

  return out;
}

export function toQuote(read: ChainlinkRead, heartbeatSec = 86_400): PriceQuote {
  const fetchedAt = Date.now();
  const ageMs = read.updatedAt ? fetchedAt - read.updatedAt : 0;
  return {
    usd: read.usd,
    source: "chainlink",
    updatedAt: read.updatedAt,
    fetchedAt,
    ageMs,
    stale: !read.updatedAt || ageMs > heartbeatSec * STALE_FACTOR * 1000,
    change24h: null,
  };
}

export { findFeed };
export type { ChainlinkFeed };
