/**
 * lib/defi/providers/geckoterminal.ts — DeFi provider GeckoTerminal.
 *
 * Data LP/pool via GeckoTerminal API v2.
 * Endpoint utama: GET /api/v2/networks/{network}/addresses/{address}/pools?include=base_token,quote_token
 * Enrichment helper: GET /api/v2/networks/{network}/pools/{poolAddress}?include=base_token,quote_token (batch 5)
 * Cache: globalCache.swr fresh 20s stale 120s. Tidak ada API key. Graceful fallback [].
 */

import { fetchWithTimeout, globalCache } from "../../cache";
import type { ChainKey } from "../../types";
import type { DefiDiscoveryProvider, DefiPosition } from "../types";

const GT_BASE = "https://api.geckoterminal.com/api/v2";

// Mapping ChainKey -> GeckoTerminal network slug.
// Ink, HyperEVM, Robinhood belum tersedia di GeckoTerminal -> null (return [] graceful).
const GT_NETWORK: Record<ChainKey, string | null> = {
  base: "base",
  bsc: "bsc",
  ink: null,
  hyperevm: null,
  robinhood: null,
};

// ───────────────────────── GeckoTerminal types ─────────────────────────

interface GtPoolAttributes {
  address?: string;
  name?: string;
  reserve_in_usd?: string | number | null;
  fdv_usd?: string | number | null;
  [k: string]: unknown;
}

interface GtPoolData {
  id: string;
  type: string;
  attributes: GtPoolAttributes;
  relationships?: {
    base_token?: { data: { id: string; type: string } };
    quote_token?: { data: { id: string; type: string } };
    dex?: { data: { id: string; type: string } };
    [k: string]: unknown;
  };
}

interface GtIncludedToken {
  id: string;
  type: string;
  attributes: {
    symbol?: string | null;
    name?: string | null;
    address?: string | null;
  };
}

interface GtResponse {
  data: GtPoolData | GtPoolData[] | null;
  included?: GtIncludedToken[];
}

// ───────────────────────── helpers ─────────────────────────

function toNumberOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

function extractPoolAddress(item: GtPoolData): string {
  const raw =
    (item.attributes.address as string | undefined) ??
    item.id.split("_").pop() ??
    item.id.split("/").pop() ??
    item.id.split("-").pop() ??
    item.id;
  return String(raw).toLowerCase();
}

function symbolFromIncluded(included: GtIncludedToken[] | undefined, relId: string | undefined): string | null {
  if (!relId || !included) return null;
  const found = included.find((i) => i.id === relId);
  const s = found?.attributes?.symbol?.trim();
  return s && s.length ? s : null;
}

function mapGtDataToPosition(
  chain: ChainKey,
  item: GtPoolData,
  included: GtIncludedToken[] | undefined
): DefiPosition {
  const poolAddress = extractPoolAddress(item);

  const baseId = item.relationships?.base_token?.data?.id as string | undefined;
  const quoteId = item.relationships?.quote_token?.data?.id as string | undefined;
  const dexIdRaw = (item.relationships?.dex?.data?.id as string | undefined) ?? null;

  const baseSym = symbolFromIncluded(included, baseId) ?? "UNKNOWN";
  const quoteSym = symbolFromIncluded(included, quoteId) ?? "UNKNOWN";

  // Fallback: coba parse dari name bila included tidak ada, mis "WETH / USDC 0.3%"
  let resolvedBase = baseSym;
  let resolvedQuote = quoteSym;
  if ((resolvedBase === "UNKNOWN" || resolvedQuote === "UNKNOWN") && typeof item.attributes.name === "string") {
    const nameParts = String(item.attributes.name)
      .split("/")
      .map((s) => s.trim().split(" ")[0].trim())
      .filter(Boolean);
    if (nameParts.length >= 2) {
      if (resolvedBase === "UNKNOWN") resolvedBase = nameParts[0] || resolvedBase;
      if (resolvedQuote === "UNKNOWN") resolvedQuote = nameParts[1] || resolvedQuote;
    }
  }

  const symbol = `${resolvedBase}/${resolvedQuote} LP`;
  const name = resolvedBase !== "UNKNOWN" && resolvedQuote !== "UNKNOWN"
    ? `${resolvedBase}/${resolvedQuote} LP`
    : (typeof item.attributes.name === "string" && item.attributes.name.trim()) || symbol;

  const reserveUsd = toNumberOrNull(item.attributes.reserve_in_usd);

  // fdv_usd bisa dipakai sebagai fallback reserveUsd jika reserve null, tapi kita simpan reserveUsd sesuai spec
  // Jika reserve null tapi fdv ada, tetap reserve null — bukan mengarang

  const protocol = dexIdRaw ?? "unknown";

  return {
    chain,
    protocol,
    poolAddress,
    lpTokenAddress: null,
    symbol,
    name,
    type: "lp",
    dexId: dexIdRaw,
    baseSymbol: resolvedBase === "UNKNOWN" ? undefined : resolvedBase,
    quoteSymbol: resolvedQuote === "UNKNOWN" ? undefined : resolvedQuote,
    reserveUsd,
    apy: null,
    logoUrl: null,
    discoverySource: "geckoterminal",
  };
}

/**
 * Enrich daftar pool addresses via GeckoTerminal.
 * Fetch per pool `GET /networks/{network}/pools/{poolAddress}?include=base_token,quote_token` batch 5.
 * Graceful fallback [] per pool jika 404/error.
 */
export async function enrichWithGeckoTerminal(
  chain: ChainKey,
  poolAddresses: string[]
): Promise<DefiPosition[]> {
  const network = GT_NETWORK[chain];
  if (!network || !poolAddresses.length) return [];

  const unique = [...new Set(poolAddresses.map((a) => a.toLowerCase()).filter(Boolean))];
  if (!unique.length) return [];

  const BATCH = 5;
  const out: DefiPosition[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < unique.length; i += BATCH) {
    const batch = unique.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (pool) => {
        const url = `${GT_BASE}/networks/${network}/pools/${pool}?include=base_token,quote_token`;
        try {
          const res = await fetchWithTimeout(url, {
            timeoutMs: 8_000,
            headers: { accept: "application/json" },
          });
          if (!res.ok) return null;
          const json = (await res.json()) as GtResponse;
          const data = json.data;
          const item: GtPoolData | null = Array.isArray(data) ? (data[0] ?? null) : (data as GtPoolData | null);
          if (!item) return null;
          const pos = mapGtDataToPosition(chain, item, json.included);
          return pos;
        } catch {
          return null;
        }
      })
    );

    for (const p of results) {
      if (!p) continue;
      if (seen.has(p.poolAddress)) continue;
      seen.add(p.poolAddress);
      out.push(p);
    }
  }

  return out;
}

export const geckoterminalDefiProvider: DefiDiscoveryProvider = {
  id: "geckoterminal",
  name: "GeckoTerminal",
  supportsChain: (c: ChainKey) => Boolean(GT_NETWORK[c]),
  discoverPositions: async (chain: ChainKey, address: string): Promise<DefiPosition[]> => {
    const network = GT_NETWORK[chain];
    if (!network) return [];

    const lower = address.toLowerCase();
    const key = `defi:geckoterminal:${chain}:${lower}`;

    try {
      const { value } = await globalCache.swr<DefiPosition[]>(
        key,
        async () => {
          const url = `${GT_BASE}/networks/${network}/addresses/${lower}/pools?include=base_token,quote_token`;
          try {
            const res = await fetchWithTimeout(url, {
              timeoutMs: 8_000,
              headers: { accept: "application/json" },
            });
            if (!res.ok) return [];
            const json = (await res.json()) as GtResponse;
            const rawData = json.data;
            if (!rawData) return [];
            const dataArray: GtPoolData[] = Array.isArray(rawData) ? rawData : [rawData as GtPoolData];
            if (!dataArray.length) return [];

            const included = json.included;
            const positions: DefiPosition[] = [];
            const seen = new Set<string>();

            for (const item of dataArray) {
              try {
                const pos = mapGtDataToPosition(chain, item, included);
                if (seen.has(pos.poolAddress)) continue;
                seen.add(pos.poolAddress);
                positions.push(pos);
              } catch {
                // skip malformed pool
              }
            }
            return positions;
          } catch {
            return [];
          }
        },
        { freshMs: 20_000, staleMs: 120_000 }
      );
      return value;
    } catch {
      return [];
    }
  },
};
