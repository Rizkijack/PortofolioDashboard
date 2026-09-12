// Portfolio engine — pure functions, no wallet dependency
// Used by API routes + client hooks. Real onchain via viem multicall when wallet connected.

import { curatedTokens, NATIVE, type TokenInfo } from "./tokens";
import type { PriceMap } from "./prices";

export type PortfolioPosition = {
  chainId: number;
  token: TokenInfo;
  balance: string; // raw bigint string
  formatted: number; // human
  priceUsd: number;
  valueUsd: number;
  change24h?: number;
};

export type PortfolioSummary = {
  totalUsd: number;
  change24hUsd: number;
  change24hPct: number;
  positions: PortfolioPosition[];
  byChain: Record<number, { usd: number; count: number }>;
  updatedAt: number;
};

// Mock generator for demo / wallet not connected — deterministic pseudo-random based on address
export function generateMockPortfolio(address?: string, prices?: PriceMap): PortfolioSummary {
  const seed = address ? parseInt(address.slice(2, 10), 16) : 0xdeadbeef;
  const rng = (n: number) => {
    const x = Math.sin(seed * 9999 + n * 1337) * 10000;
    return x - Math.floor(x);
  };

  const positions: PortfolioPosition[] = curatedTokens.slice(0, 8).map((token, i) => {
    const r = rng(i);
    // balance: native 0.1-5, stable 100-5000, others 10-500
    let formatted = 0;
    if (token.address === NATIVE) formatted = 0.2 + r * 4.8;
    else if (token.symbol === "USDC" || token.symbol === "USDT" || token.symbol === "BUSD" || token.symbol === "DAI")
      formatted = 100 + r * 4900;
    else formatted = 5 + r * 800;

    const priceUsd = prices?.[token.coingeckoId || ""]?.usd ?? (token.symbol === "USDC" || token.symbol === "USDT" ? 1 : 1.5 + r * 10);
    const change24h = prices?.[token.coingeckoId || ""]?.change24h ?? (r - 0.5) * 6;
    return {
      chainId: token.chainId,
      token,
      balance: (BigInt(Math.floor(formatted * 10 ** token.decimals))).toString(),
      formatted,
      priceUsd,
      valueUsd: formatted * priceUsd,
      change24h,
    };
  });

  const totalUsd = positions.reduce((a, p) => a + p.valueUsd, 0);
  const change24hUsd = positions.reduce((a, p) => a + p.valueUsd * ((p.change24h || 0) / 100), 0);
  const change24hPct = totalUsd ? (change24hUsd / (totalUsd - change24hUsd)) * 100 : 0;

  const byChain: Record<number, { usd: number; count: number }> = {};
  for (const p of positions) {
    if (!byChain[p.chainId]) byChain[p.chainId] = { usd: 0, count: 0 };
    byChain[p.chainId].usd += p.valueUsd;
    byChain[p.chainId].count += 1;
  }

  return { totalUsd, change24hUsd, change24hPct, positions, byChain, updatedAt: Date.now() };
}

// Real onchain fetcher stub — to be used with viem publicClient
// For now, returns mock but structure ready for wagmi integration
export async function fetchPortfolioOnchain(
  address: `0x${string}`,
  chainId: number,
  prices: PriceMap
): Promise<PortfolioPosition[]> {
  // TODO: implement viem multicall: balanceOf + native balance
  // This keeps API shape stable; hook will swap to real when wagmi ready
  const mock = generateMockPortfolio(address, prices);
  return mock.positions.filter((p) => p.chainId === chainId);
}
