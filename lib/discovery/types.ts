/**
 * lib/discovery/types.ts — tipe data provider discovery & wallet SDK
 */

import type { ChainKey } from "../types";

export type DiscoverySource =
  | "blockscout"
  | "routescan"
  | "rabby"
  | "zerion"
  | "okx"
  | "etherscan";

export interface DiscoveredToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  /** Saldo dari explorer/SDK (dipakai sebagai fallback jika RPC lambat) */
  rawBalance: string;
  explorerRateUsd: number | null;
  marketCapUsd: number | null;
  volume24hUsd: number | null;
  holdersCount: number | null;
  logoUrl: string | null;
  type: string;
  suspicious: boolean;
  verified?: boolean;
  protocol?: string | null;
  discoverySource: DiscoverySource;
}

export interface TokenDiscoveryProvider {
  id: DiscoverySource;
  name: string;
  supportsChain: (chain: ChainKey) => boolean;
  discoverTokens: (chain: ChainKey, address: string) => Promise<DiscoveredToken[]>;
}
