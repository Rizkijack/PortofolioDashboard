/**
 * lib/compat.ts — bentuk data datar yang dikonsumsi komponen UI.
 *
 * Semua nilai diturunkan dari PortfolioResponse NYATA (lib/portfolio.ts).
 * Tidak ada mock.
 */

import { CHAINS, CHAIN_ORDER, VIEM_CHAINS, supportedChains, chainMeta, getChainById } from "./chains";
import type { ChainKey, PortfolioResponse, PriceSource } from "./types";

export { supportedChains, chainMeta, getChainById };

export interface LegacyToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  /** dipertahankan untuk kompatibilitas; kosong karena harga kini per-kontrak */
  coingeckoId?: string;
  logo?: string | null;
}

export interface PortfolioPosition {
  chainId: number;
  chainKey: ChainKey;
  token: LegacyToken;
  /** saldo mentah lossless */
  rawBalance: string;
  /** saldo terdesimal lossless (string) */
  balance: string;
  /** versi numerik untuk render tabel */
  formatted: number;
  priceUsd: number | null;
  valueUsd: number | null;
  change24h: number;
  priceSource: PriceSource;
  priceAgeMs: number;
  priceStale: boolean;
  isNative: boolean;
  suspicious: boolean;
  verified?: boolean;
  protocol?: string | null;
  discoverySource?: string;
}

export interface PortfolioSummary {
  address: string | null;
  totalUsd: number;
  change24hUsd: number;
  change24hPct: number;
  positions: PortfolioPosition[];
  byChain: Record<number, { usd: number; count: number }>;
  allocation: Array<{ chainKey: ChainKey; valueUsd: number; pct: number }>;
  sourcesUsed: PriceSource[];
  warnings: string[];
  partial: boolean;
  updatedAt: number;
}

export function toPositions(res: PortfolioResponse): PortfolioPosition[] {
  const out: PortfolioPosition[] = [];
  for (const cp of res.chains) {
    for (const t of cp.tokens) {
      out.push({
        chainId: cp.meta.chainId,
        chainKey: t.chain,
        token: {
          address: t.address,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
          chainId: cp.meta.chainId,
          logo: t.logoUrl ?? null,
        },
        rawBalance: t.rawBalance,
        balance: t.balance,
        formatted: Number(t.balance),
        priceUsd: t.price.usd,
        valueUsd: t.valueUsd,
        change24h: t.price.change24h ?? 0,
        priceSource: t.price.source,
        priceAgeMs: t.price.ageMs,
        priceStale: t.price.stale,
        isNative: t.isNative,
        suspicious: t.suspicious ?? false,
        verified: t.verified,
        protocol: t.protocol,
        discoverySource: t.discoverySource,
      });
    }
  }
  return out.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
}

export function summarize(res: PortfolioResponse | null): PortfolioSummary | null {
  if (!res) return null;
  const positions = toPositions(res);

  const byChain: PortfolioSummary["byChain"] = {};
  for (const p of positions) {
    if (!byChain[p.chainId]) byChain[p.chainId] = { usd: 0, count: 0 };
    byChain[p.chainId].count += 1;
    if (p.valueUsd !== null) byChain[p.chainId].usd += p.valueUsd;
  }

  // perubahan 24 jam hanya dari posisi yang benar-benar punya change24h
  let changeUsd = 0;
  let baseUsd = 0;
  for (const p of positions) {
    if (p.valueUsd === null || p.change24h === 0) continue;
    const prev = p.valueUsd / (1 + p.change24h / 100);
    changeUsd += p.valueUsd - prev;
    baseUsd += prev;
  }

  return {
    address: res.address,
    totalUsd: res.totalValueUsd ?? 0,
    change24hUsd: changeUsd,
    change24hPct: baseUsd > 0 ? (changeUsd / baseUsd) * 100 : 0,
    positions,
    byChain,
    allocation: res.allocation.map((a) => ({ chainKey: a.chain, valueUsd: a.valueUsd, pct: a.pct })),
    sourcesUsed: res.sourcesUsed,
    warnings: res.chains.flatMap((c) => c.warnings),
    partial: res.partial,
    updatedAt: res.fetchedAt,
  };
}

/** Ringkasan kosong (belum ada address) — BUKAN data palsu, hanya nol. */
export function emptySummary(address?: string): PortfolioSummary {
  return {
    address: address ?? null,
    totalUsd: 0,
    change24hUsd: 0,
    change24hPct: 0,
    positions: [],
    byChain: {},
    allocation: [],
    sourcesUsed: [],
    warnings: [],
    partial: false,
    updatedAt: Date.now(),
  };
}

export { CHAINS, CHAIN_ORDER, VIEM_CHAINS };
