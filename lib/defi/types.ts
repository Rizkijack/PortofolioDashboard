/**
 * lib/defi/types.ts — kontrak tipe discovery DeFi (LP / vault / staking).
 */

import type { ChainKey } from "../types";

export interface DefiPosition {
  chain: ChainKey;
  protocol: string; // "uniswap" | "sushiswap" | "pancakeswap" etc
  poolAddress: string; // pair/pool address lower
  lpTokenAddress?: string | null;
  symbol: string; // e.g. "WETH/USDC LP"
  name: string;
  type: "lp" | "vault" | "staking" | "unknown";
  dexId?: string | null;
  baseSymbol?: string;
  quoteSymbol?: string;
  reserveUsd?: number | null; // tvl/liquidity usd
  apy?: number | null;
  logoUrl?: string | null;
  discoverySource: string; // "dexscreener" | "geckoterminal"
}

export interface DefiDiscoveryProvider {
  id: string;
  name: string;
  supportsChain: (c: ChainKey) => boolean;
  discoverPositions: (chain: ChainKey, address: string) => Promise<DefiPosition[]>;
}
