/**
 * lib/types.ts — kontrak tipe kanonik.
 *
 * Dipakai bersama oleh lapisan data (server) dan UI (client).
 */

// ─────────────────────────── Chain ───────────────────────────

export type ChainKey = "robinhood" | "base" | "bsc" | "hyperevm" | "ink";

export interface ChainMeta {
  key: ChainKey;
  chainId: number;
  hexChainId: `0x${string}`;
  name: string;
  shortName: string;
  nativeSymbol: string;
  nativeDecimals: number;
  /** slug DexScreener (terverifikasi) */
  dexscreenerSlug: string;
  explorer: string;
  color: string;
  blockTimeMs: number;
}

// ─────────────────────────── Harga ───────────────────────────

export type PriceSource =
  | "chainlink"
  | "redstone"
  | "pyth"
  | "binance-ws"
  | "redstone-api"
  | "dexscreener"
  | "blockscout"
  | "coingecko"
  | "none";

export interface PriceQuote {
  /** Harga USD. `null` = tidak tersedia — JANGAN isi 0. */
  usd: number | null;
  source: PriceSource;
  /** epoch ms saat sumber melaporkan harga */
  updatedAt: number;
  /** epoch ms saat server membacanya */
  fetchedAt: number;
  ageMs: number;
  stale: boolean;
  change24h?: number | null;
  crossCheckedBy?: PriceSource[];
}

// ─────────────────────────── Token & Saldo ───────────────────────────

/** Sentinel native gas token. */
export const NATIVE_ADDRESS = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

export interface TokenBalance {
  chain: ChainKey;
  address: string;
  addressLower: string;
  symbol: string;
  name: string;
  decimals: number;
  /** saldo mentah, lossless */
  rawBalance: string;
  /** saldo terdesimal, lossless */
  balance: string;
  isNative: boolean;
  logoUrl?: string | null;
  price: PriceQuote;
  valueUsd: number | null;
  suspicious?: boolean;
}

// ─────────────────────────── Portofolio ───────────────────────────

export interface ChainPortfolio {
  chain: ChainKey;
  meta: ChainMeta;
  nativeBalance: string;
  nativeValueUsd: number | null;
  tokens: TokenBalance[];
  totalValueUsd: number | null;
  hasPricing: boolean;
  warnings: string[];
  fetchedAt: number;
}

export interface AllocationEntry {
  chain: ChainKey;
  valueUsd: number;
  pct: number;
}

export interface PortfolioResponse {
  address: string;
  addressLower: string;
  chains: ChainPortfolio[];
  totalValueUsd: number | null;
  allocation: AllocationEntry[];
  sourcesUsed: PriceSource[];
  fetchedAt: number;
  /** true bila minimal satu chain gagal diambil */
  partial: boolean;
}

export interface ChainsResponse {
  chains: Array<{
    meta: ChainMeta;
    rpc: { url: string; ok: boolean; latencyMs: number | null; blockNumber: string | null };
    failover: Array<{ url: string; ok: boolean }>;
  }>;
  fetchedAt: number;
}

export interface TokenDetailResponse {
  token: TokenBalance | null;
  meta: {
    holdersCount: number | null;
    totalSupply: string | null;
    circulatingMarketCap: number | null;
    volume24h: number | null;
    explorerUrl: string;
    priceFeeds: Array<{ source: PriceSource; address?: string; label: string }>;
  };
  chart?: Array<{ t: number; o: number; h: number; l: number; c: number }>;
  warnings: string[];
}

export function priceKey(chain: ChainKey, address: string): string {
  return `${chain}:${address.toLowerCase()}`;
}
