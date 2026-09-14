/**
 * lib/portfolio.ts — mesin portofolio NYATA.
 *
 * Alur per chain:
 *   1. discovery saldo  (Blockscout v2 / Routescan)
 *   2. saldo native     (RPC eth_getBalance via multicall/failover)
 *   3. saldo ERC-20     (multicall balanceOf, batch 120)
 *   4. harga            (Chainlink → RedStone → Binance → DexScreener → explorer rate)
 *
 * NAMA EXPORT LAMA DIPERTAHANKAN (`fetchPortfolioOnchain`, `getUniqueCoingeckoIds`
 * tidak dipakai lagi) supaya UI tetap kompilasi — tetapi TIDAK ADA MOCK.
 */

import { parseAbi } from "viem";
import { withFailover } from "./rpc";
import { CHAINS, MULTICALL3 } from "./chains";
import type { ChainKey } from "./types";
import { discoverTokens, type DiscoveredToken } from "./discovery";
import { resolveQuotes, fillFromDexScreener } from "./oracle";
import { rawToDecimalString } from "./format";
import {
  NATIVE_ADDRESS,
  type AllocationEntry,
  type ChainPortfolio,
  type PortfolioResponse,
  type PriceQuote,
  type PriceSource,
  type TokenBalance,
} from "./types";

const ERC20_ABI = parseAbi([
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const ERC20_BATCH = 100;

/** Batas multicall paralel — sekuensial murni terlalu lambat untuk whale (1000+ token). */
const ERC20_CONCURRENCY = 10;

/** Skala harga 1e8 (8 desimal) — dipakai perkalian BigInt agar presisi raw > 2^53 tetap utuh. */
const PRICE_SCALE = 1e8;

async function readNative(chain: ChainKey, owner: string): Promise<{ raw: string; error?: string }> {
  try {
    const { value } = await withFailover(chain, (client) =>
      client.getBalance({ address: owner as `0x${string}` })
    );
    return { raw: value.toString() };
  } catch (e) {
    return { raw: "0", error: e instanceof Error ? e.message.slice(0, 160) : String(e) };
  }
}

/**
 * Baca saldo ERC-20 via multicall.
 *
 * Kalau satu batch gagal (RPC publik kadang menolak multicall besar),
 * batch itu dipecah lagi sampai ukuran 1 sebelum menyerah — supaya satu
 * kegagalan tidak menghilangkan seluruh token dari daftar.
 */
async function readErc20Balances(
  chain: ChainKey,
  owner: string,
  tokens: DiscoveredToken[]
): Promise<{ balances: Map<string, bigint>; unread: string[] }> {
  const balances = new Map<string, bigint>();
  const unread: string[] = [];

  const readChunk = async (slice: DiscoveredToken[]): Promise<void> => {
    if (!slice.length) return;
    const contracts = slice.map((t) => ({
      address: t.address as `0x${string}`,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: [owner as `0x${string}`] as const,
    }));
    try {
      const { value } = await withFailover(chain, (client) =>
        client.multicall({ multicallAddress: MULTICALL3, allowFailure: true, contracts })
      );
      for (let j = 0; j < slice.length; j++) {
        const r = value[j];
        if (r?.status === "success") balances.set(slice[j].address, r.result as bigint);
        else unread.push(slice[j].address);
      }
    } catch {
      if (slice.length === 1) {
        unread.push(slice[0].address);
        return;
      }
      const mid = Math.ceil(slice.length / 2);
      await readChunk(slice.slice(0, mid));
      await readChunk(slice.slice(mid));
    }
  };

  const chunks: DiscoveredToken[][] = [];
  for (let i = 0; i < tokens.length; i += ERC20_BATCH) {
    chunks.push(tokens.slice(i, i + ERC20_BATCH));
  }

  // Pool terbatas: paralel tapi tidak membanjiri RPC publik.
  // Map/set dishare aman (JS single-threaded; mutasi sinkron antar await).
  let next = 0;
  const workers = Array.from(
    { length: Math.min(ERC20_CONCURRENCY, chunks.length) },
    async () => {
      while (next < chunks.length) {
        const slice = chunks[next++];
        await readChunk(slice);
      }
    }
  );
  await Promise.all(workers);
  return { balances, unread };
}

function noneQuote(): PriceQuote {
  return {
    usd: null,
    source: "none" as PriceSource,
    updatedAt: 0,
    fetchedAt: Date.now(),
    ageMs: 0,
    stale: true,
    change24h: null,
  };
}

export async function fetchChainPortfolio(
  chain: ChainKey,
  owner: string,
  opts: { includeZero?: boolean } = {}
): Promise<ChainPortfolio> {
  const meta = CHAINS[chain];
  const warnings: string[] = [];

  const [native, discovered] = await Promise.all([
    readNative(chain, owner),
    discoverTokens(chain, owner).catch((e) => {
      warnings.push(`discovery: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`);
      return [] as DiscoveredToken[];
    }),
  ]);
  if (native.error) warnings.push(`native: ${native.error}`);
  // Jika discovery kosong tapi RPC native ada, beri info jujur ketika provider gagal total (mis. Blockscout 500/HTML)
  // Portfolio tetap tampil native, tapi partial true supaya user tahu explorer sempat error
  // (discoverTokens yang swr sudah handle Promise.allSettled, jadi jika semua provider fulfilled [] tidak perlu warning)

  const { balances, unread } = await readErc20Balances(chain, owner, discovered);
  if (unread.length > 0) {
    warnings.push(
      `${unread.length}/${discovered.length} token tidak bisa dibaca on-chain — nilai dari explorer (ditandai)`
    );
  }

  interface Candidate {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    raw: bigint;
    isNative: boolean;
    logoUrl: string | null;
    suspicious: boolean;
    verified?: boolean;
    protocol?: string | null;
    discoverySource?: string;
    explorerRateUsd: number | null;
    /** dari mana saldo diperoleh */
    balanceSource: "onchain" | "explorer";
  }

  const candidates: Candidate[] = [];

  const nativeRaw = BigInt(native.raw || "0");
  if (nativeRaw > 0n || opts.includeZero) {
    candidates.push({
      address: NATIVE_ADDRESS,
      symbol: meta.nativeSymbol,
      name: meta.nativeSymbol,
      decimals: meta.nativeDecimals,
      raw: nativeRaw,
      isNative: true,
      logoUrl: null,
      suspicious: false,
      verified: true,
      protocol: null,
      discoverySource: "native_rpc",
      explorerRateUsd: null,
      balanceSource: "onchain",
    });
  }

  for (const t of discovered) {
    const fromChain = balances.get(t.address);
    // Fallback ke angka explorer/SDK HANYA bila memang melaporkan saldo,
    // dan ditandai `balanceSource: "explorer"` supaya UI bisa membedakan.
    const explorerRaw = t.rawBalance && t.rawBalance !== "0" ? BigInt(t.rawBalance) : null;
    const value = fromChain ?? explorerRaw;
    if (value === null) continue;
    if (value > 0n || opts.includeZero) {
      candidates.push({
        address: t.address,
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        raw: value,
        isNative: false,
        logoUrl: t.logoUrl,
        suspicious: t.suspicious || fromChain === undefined,
        verified: t.verified,
        protocol: t.protocol,
        discoverySource: t.discoverySource,
        explorerRateUsd: t.explorerRateUsd,
        balanceSource: fromChain !== undefined ? "onchain" : "explorer",
      });
    }
  }

  const quotes = await resolveQuotes(
    chain,
    candidates.map((c) => ({ address: c.address, symbol: c.symbol, isNative: c.isNative }))
  );
  await fillFromDexScreener(
    chain,
    candidates.map((c) => ({ address: c.address, symbol: c.symbol })),
    quotes
  );

  const tokens: TokenBalance[] = candidates.map((c) => {
    let q = quotes.get(c.address.toLowerCase());

    // fallback terakhir: exchange_rate dari explorer (khusus token Robinhood)
    if ((!q || q.usd === null) && c.explorerRateUsd && c.explorerRateUsd > 0) {
      const fetchedAt = Date.now();
      q = {
        usd: c.explorerRateUsd,
        source: "blockscout",
        updatedAt: fetchedAt,
        fetchedAt,
        ageMs: 0,
        stale: false,
        change24h: null,
      };
    }
    if (!q) q = noneQuote();

    const balance = rawToDecimalString(c.raw.toString(), c.decimals);
    // Presisi: hitung dari raw via BigInt (skala harga 1e8) — hindari double-rounding Number(bal)*price
    let valueUsd: number | null = null;
    if (q.usd !== null && Number.isFinite(q.usd)) {
      const priceScaled = BigInt(Math.round(q.usd * PRICE_SCALE));
      const valueScaled = (c.raw * priceScaled) / 10n ** BigInt(c.decimals);
      valueUsd = Number(valueScaled) / PRICE_SCALE;
    }

    return {
      chain,
      address: c.address,
      addressLower: c.address.toLowerCase(),
      symbol: c.symbol,
      name: c.name,
      decimals: c.decimals,
      rawBalance: c.raw.toString(),
      balance,
      isNative: c.isNative,
      logoUrl: c.logoUrl,
      price: q,
      valueUsd: valueUsd !== null && Number.isFinite(valueUsd) ? valueUsd : null,
      suspicious: c.suspicious,
      verified: c.verified,
      protocol: c.protocol,
      discoverySource: c.discoverySource,
    } satisfies TokenBalance;
  });

  tokens.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));

  const priced = tokens.filter((t) => t.valueUsd !== null);
  const totalValueUsd = priced.length
    ? priced.reduce((sum, t) => sum + (t.valueUsd ?? 0), 0)
    : tokens.length === 0
      ? 0
      : null;

  const nativeToken = tokens.find((t) => t.isNative);

  return {
    chain,
    meta,
    nativeBalance: nativeToken?.balance ?? "0",
    nativeValueUsd: nativeToken?.valueUsd ?? null,
    tokens,
    totalValueUsd,
    hasPricing: priced.length > 0,
    warnings,
    fetchedAt: Date.now(),
  };
}

export async function fetchPortfolio(
  owner: string,
  chains: ChainKey[],
  opts: { includeZero?: boolean } = {}
): Promise<PortfolioResponse> {
  const settled = await Promise.all(
    chains.map(async (chain): Promise<ChainPortfolio> => {
      try {
        return await fetchChainPortfolio(chain, owner, opts);
      } catch (e) {
        return {
          chain,
          meta: CHAINS[chain],
          nativeBalance: "0",
          nativeValueUsd: null,
          tokens: [],
          totalValueUsd: null,
          hasPricing: false,
          warnings: [`chain failed: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`],
          fetchedAt: Date.now(),
        };
      }
    })
  );

  const withValue = settled.filter((c) => c.totalValueUsd !== null && c.totalValueUsd > 0);
  const anyPriced = settled.some((c) => c.totalValueUsd !== null);
  const grandTotal = withValue.length
    ? withValue.reduce((s, c) => s + (c.totalValueUsd ?? 0), 0)
    : anyPriced
      ? 0
      : null;

  const allocation: AllocationEntry[] = withValue
    .map((c) => ({
      chain: c.chain,
      valueUsd: c.totalValueUsd ?? 0,
      pct: grandTotal && grandTotal > 0 ? ((c.totalValueUsd ?? 0) / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  const sourcesUsed = [
    ...new Set(
      settled
        .flatMap((c) => c.tokens.map((t) => t.price.source))
        .filter((s): s is PriceSource => s !== "none")
    ),
  ];

  return {
    address: owner,
    addressLower: owner.toLowerCase(),
    chains: settled,
    totalValueUsd: grandTotal,
    allocation,
    sourcesUsed,
    fetchedAt: Date.now(),
    partial: settled.some((c) => c.warnings.length > 0),
  };
}
