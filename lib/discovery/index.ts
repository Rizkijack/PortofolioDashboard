/**
 * lib/discovery/index.ts — Engine penemuan saldo token multi-provider (Blockscout, Rabby, Zerion, OKX, Routescan, Etherscan).
 */

import { fetchWithTimeout, globalCache } from "../cache";
import type { ChainKey } from "../types";
import type { DiscoveredToken, TokenDiscoveryProvider } from "./types";
import { rabbyProvider } from "./providers/rabby";
import { zerionProvider } from "./providers/zerion";
import { okxProvider } from "./providers/okx";
import { etherscanProvider } from "./providers/etherscan";

export type { DiscoveredToken, DiscoverySource } from "./types";

const V2_BASES: Partial<Record<ChainKey, string>> = {
  base: "https://base.blockscout.com",
  ink: "https://explorer.inkonchain.com",
  robinhood: "https://robinhoodchain.blockscout.com",
  // HypereVM: hyperevmscan.io tidak expose Blockscout v2 (return HTML) — tidak ada fallback Blockscout, hanya native via RPC + DexScreener pricing
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function browserHeaders(base: string, refererPath = "/"): Record<string, string> {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": UA,
    referer: `${base}${refererPath}`,
    origin: base,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  };
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

interface V2TokenBalance {
  token?: {
    address_hash?: string;
    address?: string;
    symbol?: string | null;
    name?: string | null;
    decimals?: string | number | null;
    type?: string | null;
    exchange_rate?: string | number | null;
    circulating_market_cap?: string | number | null;
    volume_24h?: string | number | null;
    holders_count?: string | number | null;
    icon_url?: string | null;
    reputation?: string | null;
  };
  value?: string;
}

async function discoverViaBlockscout(
  chain: ChainKey,
  base: string,
  address: string
): Promise<DiscoveredToken[]> {
  const res = await fetchWithTimeout(`${base}/api/v2/addresses/${address}/token-balances`, {
    timeoutMs: 15_000,
    headers: browserHeaders(base, `/address/${address}`),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`blockscout(${chain}) ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("text/html")) {
    const txt = await res.text();
    throw new Error(`blockscout(${chain}) html ${txt.slice(0, 80)}`);
  }

  let rows: V2TokenBalance[];
  try {
    rows = (await res.json()) as V2TokenBalance[];
  } catch (e) {
    throw new Error(`blockscout(${chain}) json ${e instanceof Error ? e.message.slice(0, 80) : String(e)}`);
  }
  if (!Array.isArray(rows)) return [];

  const out: DiscoveredToken[] = [];
  for (const r of rows) {
    const t = r.token;
    const addr = t?.address_hash ?? t?.address;
    if (!addr || !r.value || r.value === "0") continue;
    out.push({
      address: addr.toLowerCase(),
      symbol: t?.symbol?.trim() || "UNKNOWN",
      name: t?.name?.trim() || "Unknown Token",
      decimals: t?.decimals !== undefined && t?.decimals !== null ? Number(t.decimals) : 18,
      rawBalance: String(r.value),
      explorerRateUsd: num(t?.exchange_rate),
      marketCapUsd: num(t?.circulating_market_cap),
      volume24hUsd: num(t?.volume_24h),
      holdersCount: num(t?.holders_count),
      logoUrl: t?.icon_url ?? null,
      type: t?.type ?? "ERC-20",
      suspicious: (t?.reputation ?? "ok") !== "ok",
      verified: t?.reputation === "ok",
      discoverySource: "blockscout",
    });
  }
  return out;
}

interface RoutescanTokenTx {
  contractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  tokenDecimal: string;
}

const ROUTESCAN_BASE = "https://api.routescan.io/v2/network/mainnet/evm";

async function discoverViaRoutescan(chain: ChainKey, address: string): Promise<DiscoveredToken[]> {
  const chainId = chain === "bsc" ? 56 : 0;
  const url =
    `${ROUTESCAN_BASE}/${chainId}/etherscan/api` +
    `?module=account&action=tokentx&address=${address}&page=1&offset=200&sort=desc`;

  const res = await fetchWithTimeout(url, {
    timeoutMs: 15_000,
    headers: browserHeaders("https://api.routescan.io", "/"),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`routescan(${chain}) ${res.status}`);

  const json = (await res.json()) as { result?: RoutescanTokenTx[] };
  const rows = Array.isArray(json.result) ? json.result : [];

  const meta = new Map<string, RoutescanTokenTx>();
  for (const r of rows) {
    if (!r?.contractAddress) continue;
    meta.set(r.contractAddress.toLowerCase(), r);
  }

  return [...meta.values()].map((r) => ({
    address: r.contractAddress.toLowerCase(),
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
    suspicious: false,
    verified: true,
    discoverySource: "routescan",
  }));
}

const blockscoutProvider: TokenDiscoveryProvider = {
  id: "blockscout",
  name: "Blockscout v2",
  supportsChain: (chain) => Boolean(V2_BASES[chain]),
  discoverTokens: async (chain, address) => {
    const base = V2_BASES[chain];
    if (!base) return [];
    return discoverViaBlockscout(chain, base, address);
  },
};

const routescanProvider: TokenDiscoveryProvider = {
  id: "routescan",
  name: "Routescan v2",
  supportsChain: (chain) => chain === "bsc",
  discoverTokens: async (chain, address) => {
    return discoverViaRoutescan(chain, address);
  },
};

const ALL_PROVIDERS: TokenDiscoveryProvider[] = [
  blockscoutProvider,
  rabbyProvider,
  routescanProvider,
  zerionProvider,
  okxProvider,
  etherscanProvider,
];

/**
 * Menggabungkan hasil discovery dari semua provider yang relevan dengan chain,
 * deduplikasi berdasarkan address, dan memperkaya metadata.
 */
export async function discoverTokens(
  chain: ChainKey,
  address: string
): Promise<DiscoveredToken[]> {
  const key = `discovery:${chain}:${address.toLowerCase()}`;
  // Throw dari fetcher (mis. "semua provider gagal") sengaja dibiarkan propagate —
  // pemanggil (lib/portfolio.ts) punya .catch sendiri untuk menandai warning partial.
  const { value } = await globalCache.swr(
    key,
    async () => {
      const eligibleProviders = ALL_PROVIDERS.filter((p) => p.supportsChain(chain));

      const results = await Promise.allSettled(
        eligibleProviders.map((p) => p.discoverTokens(chain, address))
      );

      const tokenMap = new Map<string, DiscoveredToken>();
      const rejected: string[] = [];

      for (let i = 0; i < results.length; i++) {
        const res = results[i];
        const prov = eligibleProviders[i];
        if (res.status === "fulfilled" && Array.isArray(res.value)) {
          for (const t of res.value) {
            const existing = tokenMap.get(t.address);
            if (!existing) {
              tokenMap.set(t.address, t);
            } else {
              // Enrich existing token metadata
              if (!existing.logoUrl && t.logoUrl) existing.logoUrl = t.logoUrl;
              if (!existing.explorerRateUsd && t.explorerRateUsd) existing.explorerRateUsd = t.explorerRateUsd;
              if (existing.symbol === "UNKNOWN" && t.symbol !== "UNKNOWN") existing.symbol = t.symbol;
              if (existing.name === "Unknown Token" && t.name !== "Unknown Token") existing.name = t.name;
              if (t.verified) existing.verified = true;
              if (t.protocol && !existing.protocol) existing.protocol = t.protocol;
              if (t.rawBalance && t.rawBalance !== "0" && existing.rawBalance === "0") {
                existing.rawBalance = t.rawBalance;
              }
            }
          }
        } else if (res.status === "rejected") {
          rejected.push(`${prov.id}: ${res.reason instanceof Error ? res.reason.message.slice(0, 80) : String(res.reason).slice(0, 80)}`);
        }
      }

      // Jika semua provider eligible gagal, throw supaya portfolio bisa tampilkan warning partial (jujur)
      if (tokenMap.size === 0 && rejected.length > 0 && rejected.length === eligibleProviders.length) {
        throw new Error(rejected.join(" | "));
      }
      // Jika sebagian gagal tapi ada data, tetap return data (jangan throw), tapi log rejected untuk debug cache tidak perlu

      return Array.from(tokenMap.values());
    },
    { freshMs: 15_000, staleMs: 180_000 }
  );
  return value;
}

/** Metadata satu token (halaman detail). Best-effort. */
export async function fetchTokenMeta(
  chain: ChainKey,
  tokenAddress: string
): Promise<Partial<DiscoveredToken> | null> {
  const base = V2_BASES[chain];
  if (!base) return null;
  try {
    const res = await fetchWithTimeout(`${base}/api/v2/tokens/${tokenAddress}`, {
      timeoutMs: 12_000,
      headers: browserHeaders(base, `/token/${tokenAddress}`),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const t = (await res.json()) as NonNullable<V2TokenBalance["token"]>;
    return {
      address: tokenAddress.toLowerCase(),
      symbol: t.symbol?.trim() || "UNKNOWN",
      name: t.name?.trim() || "Unknown Token",
      decimals: t.decimals !== undefined && t.decimals !== null ? Number(t.decimals) : 18,
      explorerRateUsd: num(t.exchange_rate),
      marketCapUsd: num(t.circulating_market_cap),
      volume24hUsd: num(t.volume_24h),
      holdersCount: num(t.holders_count),
      logoUrl: t.icon_url ?? null,
      type: t.type ?? "ERC-20",
      suspicious: (t.reputation ?? "ok") !== "ok",
      verified: t.reputation === "ok",
      discoverySource: "blockscout",
    };
  } catch {
    return null;
  }
}
