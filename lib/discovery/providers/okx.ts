/**
 * lib/discovery/providers/okx.ts — OKX Web3 Wallet Data API Provider
 * 
 * Adapter untuk membaca aset multi-chain melalui OKX Web3 API jika tersedia OKX credentials.
 */

import { fetchWithTimeout } from "../../cache";
import type { ChainKey } from "../../types";
import type { DiscoveredToken, TokenDiscoveryProvider } from "../types";

const OKX_CHAIN_IDS: Partial<Record<ChainKey, string>> = {
  base: "8453",
  bsc: "56",
  ink: "57073",
};

interface OkxTokenAsset {
  tokenAddress?: string;
  symbol?: string;
  tokenName?: string;
  decimals?: string | number;
  balance?: string;
  tokenPrice?: string | number;
  isRiskToken?: boolean;
  iconUrl?: string;
}

export const okxProvider: TokenDiscoveryProvider = {
  id: "okx",
  name: "OKX Web3 API",
  supportsChain: (chain: ChainKey) => Boolean(OKX_CHAIN_IDS[chain]),
  discoverTokens: async (chain: ChainKey, userAddress: string): Promise<DiscoveredToken[]> => {
    const apiKey = process.env.OKX_API_KEY || process.env.NEXT_PUBLIC_OKX_API_KEY;
    const secretKey = process.env.OKX_SECRET_KEY;
    const passphrase = process.env.OKX_PASSPHRASE;
    const chainId = OKX_CHAIN_IDS[chain];

    if (!apiKey || !chainId) return [];

    try {
      const url = `https://www.okx.com/api/v5/wallet/asset/all-token-balances-by-chain?address=${userAddress}&chainId=${chainId}`;
      const headers: Record<string, string> = {
        "OK-ACCESS-KEY": apiKey,
        accept: "application/json",
      };
      if (secretKey) headers["OK-ACCESS-SIGN"] = secretKey;
      if (passphrase) headers["OK-ACCESS-PASSPHRASE"] = passphrase;

      const res = await fetchWithTimeout(url, {
        timeoutMs: 8_000,
        headers,
        cache: "no-store",
      });

      if (!res.ok) return [];
      const json = (await res.json()) as {
        data?: Array<{ tokenAssets?: OkxTokenAsset[] }>;
      };

      const list = json.data?.[0]?.tokenAssets || [];
      const out: DiscoveredToken[] = [];

      for (const item of list) {
        const addr = item.tokenAddress;
        if (!addr || !addr.startsWith("0x") || addr.length !== 42) continue;

        const decimals = Number(item.decimals ?? 18) || 18;
        let rawBal = "0";
        if (item.balance) {
          try {
            const n = parseFloat(item.balance);
            rawBal = Math.floor(n * 10 ** decimals).toString();
          } catch {
            rawBal = "0";
          }
        }

        out.push({
          address: addr.toLowerCase(),
          symbol: item.symbol?.trim() || "UNKNOWN",
          name: item.tokenName?.trim() || "Unknown Token",
          decimals,
          rawBalance: rawBal,
          explorerRateUsd: item.tokenPrice ? Number(item.tokenPrice) : null,
          marketCapUsd: null,
          volume24hUsd: null,
          holdersCount: null,
          logoUrl: item.iconUrl || null,
          type: "ERC-20",
          suspicious: Boolean(item.isRiskToken),
          verified: !item.isRiskToken,
          protocol: null,
          discoverySource: "okx",
        });
      }
      return out;
    } catch {
      return [];
    }
  },
};
