/**
 * lib/discovery/providers/etherscan.ts — Etherscan / BscScan / BaseScan v2 API Provider
 * 
 * Mendukung pembacaan list token dan transfer token untuk audit explorer resmi.
 */

import { fetchWithTimeout } from "../../cache";
import type { ChainKey } from "../../types";
import type { DiscoveredToken, TokenDiscoveryProvider } from "../types";

const EXPLORER_APIS: Partial<Record<ChainKey, { url: string; envKey: string }>> = {
  base: {
    url: "https://api.basescan.org/api",
    envKey: "BASESCAN_API_KEY",
  },
  bsc: {
    url: "https://api.bscscan.com/api",
    envKey: "BSCSCAN_API_KEY",
  },
};

interface EtherscanTxItem {
  contractAddress?: string;
  tokenSymbol?: string;
  tokenName?: string;
  tokenDecimal?: string;
}

export const etherscanProvider: TokenDiscoveryProvider = {
  id: "etherscan",
  name: "Etherscan Family API",
  supportsChain: (chain: ChainKey) => Boolean(EXPLORER_APIS[chain]),
  discoverTokens: async (chain: ChainKey, userAddress: string): Promise<DiscoveredToken[]> => {
    const config = EXPLORER_APIS[chain];
    if (!config) return [];

    const apiKey = process.env[config.envKey] || process.env.ETHERSCAN_API_KEY;
    if (!apiKey) return [];

    // M7/M9 fix: validasi address & jangan hardcode verified:true untuk tokentx (riwayat, bukan saldo)
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) return [];
    try {
      const url = `${config.url}?module=account&action=tokentx&address=${encodeURIComponent(userAddress)}&page=1&offset=100&sort=desc&apikey=${encodeURIComponent(apiKey)}`;
      const res = await fetchWithTimeout(url, {
        timeoutMs: 8_000,
        headers: { accept: "application/json" },
        cache: "no-store",
      });

      if (!res.ok) return [];
      const json = (await res.json()) as { result?: EtherscanTxItem[] };
      const list = Array.isArray(json.result) ? json.result : [];

      const map = new Map<string, EtherscanTxItem>();
      for (const r of list) {
        if (r?.contractAddress && r.contractAddress.startsWith("0x")) {
          map.set(r.contractAddress.toLowerCase(), r);
        }
      }

      return [...map.values()].map((r) => ({
        address: r.contractAddress!.toLowerCase(),
        symbol: r.tokenSymbol?.trim() || "UNKNOWN",
        name: r.tokenName?.trim() || "Unknown Token",
        decimals: Number(r.tokenDecimal ?? 18) || 18,
        rawBalance: "0",
        explorerRateUsd: null,
        marketCapUsd: null,
        volume24hUsd: null,
        holdersCount: null,
        logoUrl: null,
        type: "ERC-20",
        // M7: tokentx bukan saldo — jangan verified true; unknown balance
        suspicious: false,
        verified: false,
        protocol: null,
        discoverySource: "etherscan",
      }));
    } catch {
      return [];
    }
  },
};
