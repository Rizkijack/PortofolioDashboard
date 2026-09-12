/**
 * lib/discovery/providers/rabby.ts — Rabby Wallet API Provider
 * 
 * Rabby Open API menyediakan token discovery & reputasi token yang sangat akurat
 * tanpa membebankan limit rate yang ketat.
 */

import { fetchWithTimeout } from "../../cache";
import type { ChainKey } from "../../types";
import type { DiscoveredToken, TokenDiscoveryProvider } from "../types";

// Chain id mapping untuk Rabby API
const RABBY_CHAIN_IDS: Partial<Record<ChainKey, string>> = {
  base: "base",
  bsc: "bsc",
  ink: "ink",
};

interface RabbyTokenItem {
  id: string;
  chain: string;
  name: string;
  symbol: string;
  decimals: number;
  logo_url?: string;
  protocol_id?: string;
  price?: number;
  is_verified?: boolean;
  is_core?: boolean;
  is_wallet?: boolean;
  amount?: number;
  raw_amount_hex_str?: string;
}

export const rabbyProvider: TokenDiscoveryProvider = {
  id: "rabby",
  name: "Rabby Wallet API",
  supportsChain: (chain: ChainKey) => Boolean(RABBY_CHAIN_IDS[chain]),
  discoverTokens: async (chain: ChainKey, userAddress: string): Promise<DiscoveredToken[]> => {
    const serverChainId = RABBY_CHAIN_IDS[chain];
    if (!serverChainId) return [];

    try {
      const url = `https://api.rabby.io/v1/user/token_list?id=${userAddress}&chain_id=${serverChainId}&is_all=false`;
      const res = await fetchWithTimeout(url, {
        timeoutMs: 8_000,
        headers: {
          accept: "application/json",
          "x-client": "RabbyWeb",
          "x-version": "0.92.88",
        },
        cache: "no-store",
      });

      if (!res.ok) return [];
      const data = (await res.json()) as RabbyTokenItem[];
      if (!Array.isArray(data)) return [];

      return data
        .filter((item) => item.id && item.id.startsWith("0x") && item.id.length === 42)
        .map((item) => {
          let rawBal = "0";
          if (item.raw_amount_hex_str) {
            try {
              rawBal = BigInt(item.raw_amount_hex_str).toString();
            } catch {
              rawBal = "0";
            }
          } else if (item.amount && item.decimals) {
            try {
              rawBal = Math.floor(item.amount * 10 ** item.decimals).toString();
            } catch {
              rawBal = "0";
            }
          }

          return {
            address: item.id.toLowerCase(),
            symbol: item.symbol?.trim() || "UNKNOWN",
            name: item.name?.trim() || "Unknown Token",
            decimals: Number(item.decimals ?? 18) || 18,
            rawBalance: rawBal,
            explorerRateUsd: typeof item.price === "number" ? item.price : null,
            marketCapUsd: null,
            volume24hUsd: null,
            holdersCount: null,
            logoUrl: item.logo_url || null,
            type: "ERC-20",
            suspicious: item.is_verified === false && !item.is_core,
            verified: item.is_verified ?? item.is_core ?? false,
            protocol: item.protocol_id || null,
            discoverySource: "rabby",
          };
        });
    } catch {
      return [];
    }
  },
};
