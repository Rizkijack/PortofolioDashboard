/**
 * lib/discovery/providers/zerion.ts — Zerion SDK / API Provider
 * 
 * Mendukung token discovery multi-chain, label protokol DeFi, dan reputasi terverifikasi.
 * Jika env ZERION_API_KEY disediakan, adapter ini akan memanfaatkan Zerion API v1.
 */

import { fetchWithTimeout } from "../../cache";
import type { ChainKey } from "../../types";
import type { DiscoveredToken, TokenDiscoveryProvider } from "../types";

const ZERION_CHAINS: Partial<Record<ChainKey, string>> = {
  base: "base",
  bsc: "binance-smart-chain",
  ink: "ink",
};

interface ZerionPosition {
  attributes?: {
    quantity?: {
      int?: string;
      decimals?: number;
      float?: number;
    };
    value?: number;
    price?: number;
    fungible_info?: {
      name?: string;
      symbol?: string;
      icon?: { url?: string };
      flags?: { verified?: boolean; scam?: boolean };
      implementations?: Array<{
        chain_id?: string;
        address?: string;
        decimals?: number;
      }>;
    };
  };
  relationships?: {
    chain?: { data?: { id?: string } };
    dapp?: { data?: { id?: string } };
  };
}

export const zerionProvider: TokenDiscoveryProvider = {
  id: "zerion",
  name: "Zerion API",
  supportsChain: (chain: ChainKey) => Boolean(ZERION_CHAINS[chain]),
  discoverTokens: async (chain: ChainKey, userAddress: string): Promise<DiscoveredToken[]> => {
    // Hanya key server-only — NEXT_PUBLIC_* tidak dipakai karena ter-bundle ke client JS.
    const apiKey = process.env.ZERION_API_KEY;
    const targetChain = ZERION_CHAINS[chain];
    if (!apiKey || !targetChain) return [];

    try {
      const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
      const url = `https://api.zerion.io/v1/wallets/${userAddress}/positions/?filter[chain_ids]=${targetChain}&filter[position_types]=wallet&currency=usd`;

      const res = await fetchWithTimeout(url, {
        timeoutMs: 8_000,
        headers: {
          accept: "application/json",
          authorization: authHeader,
        },
        cache: "no-store",
      });

      if (!res.ok) return [];
      const json = (await res.json()) as { data?: ZerionPosition[] };
      const list = json.data || [];

      const out: DiscoveredToken[] = [];
      for (const item of list) {
        const attr = item.attributes;
        const info = attr?.fungible_info;
        const impl = info?.implementations?.find((i) => i.chain_id === targetChain);
        const addr = impl?.address;
        if (!addr || !addr.startsWith("0x")) continue;

        out.push({
          address: addr.toLowerCase(),
          symbol: info?.symbol?.trim() || "UNKNOWN",
          name: info?.name?.trim() || "Unknown Token",
          decimals: impl?.decimals ?? attr?.quantity?.decimals ?? 18,
          rawBalance: attr?.quantity?.int || "0",
          explorerRateUsd: typeof attr?.price === "number" ? attr.price : null,
          marketCapUsd: null,
          volume24hUsd: null,
          holdersCount: null,
          logoUrl: info?.icon?.url || null,
          type: "ERC-20",
          suspicious: Boolean(info?.flags?.scam),
          verified: Boolean(info?.flags?.verified),
          protocol: item.relationships?.dapp?.data?.id || null,
          discoverySource: "zerion",
        });
      }
      return out;
    } catch {
      return [];
    }
  },
};
