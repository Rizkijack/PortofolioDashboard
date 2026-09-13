/**
 * lib/defi/providers/uniswap.ts — DeFi provider Uniswap V2 + V3 (dan Pancake V3 di BSC).
 *
 * - V2: reuse Blockscout token-balances (symbol UNI-V2 / LP) → enrich via DexScreener,
 *       filter dexId uniswap / sushiswap / pancakeswap / aerodrome.
 * - V3: on-chain NFT positions via NonfungiblePositionManager (balanceOf + tokenOfOwnerByIndex + positions)
 *       dengan fallback graceful [] bila RPC gagal / bytecode tidak ada.
 *
 * Cache: globalCache.swr fresh 20s stale 120s. Tidak ada API key. Tidak throw — selalu return [] on error.
 * Pakai fetchWithTimeout 8s untuk HTTP, dan withFailover untuk viem RPC.
 */

import { BROWSER_UA, fetchWithTimeout, globalCache } from "../../cache";
import { CHAINS } from "../../chains";
import { withFailover } from "../../rpc";
import type { ChainKey } from "../../types";
import type { DefiDiscoveryProvider, DefiPosition } from "../types";

// ───────────────────── address registry ─────────────────────

// Uniswap V3 NonfungiblePositionManager — terverifikasi via explorer:
// Base: 0x03a520b32C04BF74f7bEBeF36A9E46a68a389e08 (Uniswap docs)
// BSC Pancake V3 Position Manager: 0x46A15B0b27311cedF172AB29E4f4766fbE7F4364
const UNISWAP_V3_NPM: Partial<Record<ChainKey, `0x${string}`>> = {
  base: "0x03a520b32C04BF74f7bEBeF36A9E46a68a389e08",
  bsc: "0x46A15B0b27311cedF172AB29E4f4766fbE7F4364",
  // ink: belum ada deployment Uniswap resmi — biarkan null untuk MVP
};

// Factory untuk resolve pool address (best-effort, fallback ke v3:<tokenId>)
const UNISWAP_V3_FACTORY: Partial<Record<ChainKey, `0x${string}`>> = {
  base: "0x33128a8fC17869897dcE68Ed026d694621f6FD97",
  bsc: "0x0BF500515197dC82B95533425c478F6D280772Eb",
};

// Blockscout v2 bases — sama seperti lib/discovery; BSC tidak punya Blockscout publik,
// jadi V2 untuk BSC akan graceful [] (V3 tetap jalan via RPC).
const V2_BASES: Partial<Record<ChainKey, string>> = {
  base: "https://base.blockscout.com",
  ink: "https://explorer.inkonchain.com",
  robinhood: "https://robinhoodchain.blockscout.com",
  hyperevm: "https://hyperevmscan.io",
};

function browserHeaders(base: string, refererPath = "/"): Record<string, string> {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": BROWSER_UA,
    referer: `${base}${refererPath}`,
    origin: base,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  };
}

// ───────────────────── ABIs ─────────────────────

const NPM_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "tokenOfOwnerByIndex",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "positions",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [
      { name: "nonce", type: "uint96" },
      { name: "operator", type: "address" },
      { name: "token0", type: "address" },
      { name: "token1", type: "address" },
      { name: "fee", type: "uint24" },
      { name: "tickLower", type: "int24" },
      { name: "tickUpper", type: "int24" },
      { name: "liquidity", type: "uint128" },
      { name: "feeGrowthInside0LastX128", type: "uint256" },
      { name: "feeGrowthInside1LastX128", type: "uint256" },
      { name: "tokensOwed0", type: "uint128" },
      { name: "tokensOwed1", type: "uint128" },
    ],
  },
] as const;

const FACTORY_ABI = [
  {
    name: "getPool",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;

const ERC20_SYMBOL_ABI = [
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

// ───────────────────── V2 helpers (DexScreener enrichment) ─────────────────────

const LP_SYMBOL_RE = /(?:\bLP\b|UNI-V2|SLP|Cake-LP)/i;

function isLpLike(symbol: string, name: string): boolean {
  return LP_SYMBOL_RE.test(symbol) || /\bLP\b/i.test(name);
}

interface V2TokenBalance {
  token?: {
    address_hash?: string;
    address?: string;
    symbol?: string | null;
    name?: string | null;
    decimals?: string | number | null;
    type?: string | null;
    exchange_rate?: string | number | null;
  };
  value?: string;
}

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; symbol: string; name: string };
  quoteToken: { address: string; symbol: string; name: string };
  liquidity?: { usd?: number };
}

interface DexScreenerResponse {
  pairs: DexScreenerPair[] | null;
}

const DEXSCREENER_BASE = "https://api.dexscreener.com";

// dex allow-list per chain untuk provider uniswap
const ALLOWED_DEX: Record<string, Set<string>> = {
  base: new Set(["uniswap", "sushiswap", "aerodrome", "baseswap", "uniswapv3", "pancakeswap"]),
  bsc: new Set(["pancakeswap", "uniswap", "sushiswap", "biswap", "apeswap"]),
  // ink / hyperevm / robinhood: tidak ada LP V2 signifikan, biarkan empty -> semua di-skip
};

async function discoverV2Uniswap(chain: ChainKey, address: string): Promise<DefiPosition[]> {
  const base = V2_BASES[chain];
  const slug = CHAINS[chain]?.dexscreenerSlug;
  if (!base || !slug) return [];

  // 1) ambil token balances dari Blockscout, filter LP-like
  const candidates: string[] = [];
  try {
    const res = await fetchWithTimeout(`${base}/api/v2/addresses/${address}/token-balances`, {
      timeoutMs: 8_000,
      headers: browserHeaders(base, `/address/${address}`),
      cache: "no-store",
    });
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    if (!Array.isArray(json)) return [];
    const rows = json as V2TokenBalance[];
    for (const r of rows) {
      const t = r.token;
      const addr = t?.address_hash ?? t?.address;
      if (!addr || !r.value || r.value === "0") continue;
      const sym = t?.symbol?.trim() ?? "";
      const nm = t?.name?.trim() ?? "";
      if (isLpLike(sym, nm)) candidates.push(addr.toLowerCase());
    }
  } catch {
    return [];
  }

  if (!candidates.length) return [];

  // 2) enrich via DexScreener, filter hanya dex uniswap-like
  const uniqueLower = [...new Set(candidates.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueLower.length; i += 30) chunks.push(uniqueLower.slice(i, i + 30));

  const inputSet = new Set(uniqueLower);
  const allowed = ALLOWED_DEX[chain] ?? new Set<string>();
  // Untuk base/bsc, jika allowed empty anggap tidak perlu filter ketat; tapi MVP kita tetap butuh filter.
  // Bila chain tidak ada di ALLOWED_DEX, kembalikan [] saja supaya tidak bocorkan DEX lain.
  if (!allowed.size) return [];

  const seenPool = new Set<string>();
  const positions: DefiPosition[] = [];

  await Promise.all(
    chunks.map(async (chunk) => {
      const url = `${DEXSCREENER_BASE}/latest/dex/tokens/${chunk.join(",")}`;
      try {
        const res = await fetchWithTimeout(url, {
          timeoutMs: 8_000,
          headers: { accept: "application/json" },
        });
        if (!res.ok) return;
        const json = (await res.json()) as DexScreenerResponse;
        const pairs = json.pairs ?? [];
        for (const pair of pairs) {
          if (pair.chainId !== slug) continue;
          if (!pair.pairAddress) continue;
          // filter dexId harus ada di allow-list uniswap
          const dexLower = (pair.dexId ?? "").toLowerCase();
          if (!allowed.has(dexLower)) continue;

          const poolAddress = pair.pairAddress.toLowerCase();
          if (seenPool.has(poolAddress)) continue;
          seenPool.add(poolAddress);

          const baseAddr = pair.baseToken.address.toLowerCase();
          const quoteAddr = pair.quoteToken.address.toLowerCase();

          let lpTokenAddress: string | null = null;
          if (inputSet.has(poolAddress)) lpTokenAddress = poolAddress;
          else if (inputSet.has(baseAddr)) lpTokenAddress = baseAddr;
          else if (inputSet.has(quoteAddr)) lpTokenAddress = quoteAddr;
          else lpTokenAddress = null;

          const baseSym = pair.baseToken.symbol?.trim() || "UNKNOWN";
          const quoteSym = pair.quoteToken.symbol?.trim() || "UNKNOWN";
          const symbol = `${baseSym}/${quoteSym} LP`;
          const name = `${baseSym}/${quoteSym} LP on ${pair.dexId}`;

          const reserveUsd =
            typeof pair.liquidity?.usd === "number" && Number.isFinite(pair.liquidity.usd)
              ? pair.liquidity.usd
              : null;

          positions.push({
            chain,
            protocol: pair.dexId ?? "uniswap",
            poolAddress,
            lpTokenAddress,
            symbol,
            name,
            type: "lp",
            dexId: pair.dexId ?? null,
            baseSymbol: baseSym,
            quoteSymbol: quoteSym,
            reserveUsd,
            apy: null,
            logoUrl: null,
            discoverySource: "uniswap",
          });
        }
      } catch {
        // per chunk graceful
      }
    })
  );

  return positions;
}

// ───────────────────── V3 helpers (on-chain) ─────────────────────

async function discoverV3Positions(chain: ChainKey, address: string): Promise<DefiPosition[]> {
  const npm = UNISWAP_V3_NPM[chain];
  if (!npm) return [];

  try {
    const { value } = await withFailover(chain, async (client) => {
      // cek bytecode ada (agar fallback cepat bila NPM tidak ter-deploy di chain ini)
      try {
        const code = await client.getBytecode({ address: npm });
        if (!code || code === "0x") return [] as DefiPosition[];
      } catch {
        // jika getBytecode gagal, lanjutkan coba balanceOf — withFailover akan handle RPC lain
      }

      let balance: bigint;
      try {
        balance = (await client.readContract({
          address: npm,
          abi: NPM_ABI,
          functionName: "balanceOf",
          args: [address as `0x${string}`],
        })) as bigint;
      } catch {
        return [] as DefiPosition[];
      }

      const count = Number(balance);
      if (!count || count <= 0 || !Number.isFinite(count)) return [] as DefiPosition[];
      const capped = Math.min(count, 20);

      // kumpulkan tokenIds
      const tokenIds: bigint[] = [];
      for (let i = 0; i < capped; i++) {
        try {
          const tid = (await client.readContract({
            address: npm,
            abi: NPM_ABI,
            functionName: "tokenOfOwnerByIndex",
            args: [address as `0x${string}`, BigInt(i)],
          })) as bigint;
          tokenIds.push(tid);
        } catch {
          // jika tokenOfOwnerByIndex tidak tersedia (tidak enumerable) — fallback: tidak bisa enumerate
          // untuk MVP, hentikan
          break;
        }
      }
      if (!tokenIds.length) return [] as DefiPosition[];

      const factory = UNISWAP_V3_FACTORY[chain] ?? null;
      const out: DefiPosition[] = [];

      // fetch positions paralel (batch 5 untuk hindari rate limit)
      const BATCH = 5;
      for (let i = 0; i < tokenIds.length; i += BATCH) {
        const batch = tokenIds.slice(i, i + BATCH);
        const batchResults = await Promise.all(
          batch.map(async (tid) => {
            try {
              const pos = (await client.readContract({
                address: npm,
                abi: NPM_ABI,
                functionName: "positions",
                args: [tid],
              })) as unknown as readonly [
                bigint, // nonce
                string, // operator
                `0x${string}`, // token0
                `0x${string}`, // token1
                number, // fee
                number, // tickLower
                number, // tickUpper
                bigint, // liquidity
                bigint,
                bigint,
                bigint,
                bigint,
              ];
              return { tokenId: tid, pos };
            } catch {
              return null;
            }
          })
        );

        for (const entry of batchResults) {
          if (!entry) continue;
          const { tokenId, pos } = entry;
          const token0 = pos[2] as `0x${string}`;
          const token1 = pos[3] as `0x${string}`;
          const fee = pos[4] as number;
          const liquidity = pos[7] as bigint;
          // skip posisi yang sudah closed (liquidity 0) — tetap bisa ditampilkan tapi untuk MVP skip agar tidak noisy
          if (liquidity === 0n) continue;

          let poolAddress: string | null = null;
          if (factory) {
            try {
              const pool = (await client.readContract({
                address: factory,
                abi: FACTORY_ABI,
                functionName: "getPool",
                args: [token0, token1, fee],
              })) as `0x${string}`;
              if (pool && pool !== "0x0000000000000000000000000000000000000000") {
                poolAddress = pool.toLowerCase();
              }
            } catch {
              // ignore — fallback ke v3:<tokenId>
            }
          }
          const finalPool = (poolAddress ?? `v3:${tokenId.toString()}`).toLowerCase();

          // best-effort ambil symbol token0/token1; jangan gagalkan whole position jika gagal
          let baseSym: string | undefined;
          let quoteSym: string | undefined;
          try {
            const [s0, s1] = await Promise.all([
              client
                .readContract({ address: token0, abi: ERC20_SYMBOL_ABI, functionName: "symbol" })
                .then((v) => (typeof v === "string" ? v.trim() : null))
                .catch(() => null) as Promise<string | null>,
              client
                .readContract({ address: token1, abi: ERC20_SYMBOL_ABI, functionName: "symbol" })
                .then((v) => (typeof v === "string" ? v.trim() : null))
                .catch(() => null) as Promise<string | null>,
            ]);
            if (s0 && s0.length) baseSym = s0;
            if (s1 && s1.length) quoteSym = s1;
          } catch {
            // ignore
          }

          const feePct = (fee / 10000).toFixed(fee % 100 === 0 ? 0 : fee % 10 === 0 ? 1 : 2);
          const symbol =
            baseSym && quoteSym
              ? `${baseSym}/${quoteSym} V3 ${feePct}% #${tokenId.toString()}`
              : `V3 #${tokenId.toString()} ${feePct}%`;
          const name = symbol;

          out.push({
            chain,
            protocol: chain === "bsc" ? "pancakeswap-v3" : "uniswap-v3",
            poolAddress: finalPool,
            lpTokenAddress: null,
            symbol,
            name,
            type: "lp",
            dexId: chain === "bsc" ? "pancakeswap" : "uniswap",
            baseSymbol: baseSym,
            quoteSymbol: quoteSym,
            reserveUsd: null,
            apy: null,
            logoUrl: null,
            discoverySource: "uniswap",
          });
        }
      }

      return out;
    });

    return value ?? [];
  } catch {
    return [];
  }
}

// ───────────────────── provider utama ─────────────────────

export const uniswapDefiProvider: DefiDiscoveryProvider = {
  id: "uniswap",
  name: "Uniswap",
  supportsChain: (c: ChainKey) => Boolean(UNISWAP_V3_NPM[c] || V2_BASES[c] && (c === "base" || c === "robinhood" || c === "ink" || c === "hyperevm")),
  // Untuk MVP strict sesuai spec: hanya base & bsc yang benar-benar didukung penuh.
  // Ink/hyperevm/robinhood hanya via V2 Blockscout bila ada — graceful [] bila tidak.
  discoverPositions: async (chain: ChainKey, address: string): Promise<DefiPosition[]> => {
    // MVP: hanya base & bsc yang dianggap "supported" untuk Uniswap/Pancake.
    // Chain lain tetap dicoba V2 tapi akan return [] bila tidak ada Blockscout/dex.
    const isSupported = chain === "base" || chain === "bsc";
    // Tetap izinkan ink/robinhood/hyperevm untuk V2 fallback, tapi tidak diiklankan sebagai supported
    // Untuk menjaga kontrak supportsChain sesuai spec "base & bsc", kita return [] untuk chain lain.
    if (!isSupported) {
      // cek apakah V2_BASES ada — untuk MVP kita tetap return [] supaya konsisten dengan spec
      // (ink/hyperevm akan ditangani geckoterminal/dexscreener, bukan uniswap)
      return [];
    }

    const lower = address.toLowerCase();
    const cacheKey = `defi:uniswap:${chain}:${lower}`;

    try {
      const { value } = await globalCache.swr<DefiPosition[]>(
        cacheKey,
        async () => {
          try {
            const [v2, v3] = await Promise.all([
              discoverV2Uniswap(chain, lower).catch(() => [] as DefiPosition[]),
              discoverV3Positions(chain, lower).catch(() => [] as DefiPosition[]),
            ]);

            // gabung + dedup by poolAddress
            const seen = new Set<string>();
            const out: DefiPosition[] = [];
            for (const p of [...v2, ...v3]) {
              if (!p.poolAddress) continue;
              const key = p.poolAddress.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              out.push(p);
            }
            return out;
          } catch {
            return [] as DefiPosition[];
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

// Helper ekspor untuk testing
export async function fetchUniswapV2Positions(chain: ChainKey, address: string): Promise<DefiPosition[]> {
  return discoverV2Uniswap(chain, address);
}

export async function fetchUniswapV3Positions(chain: ChainKey, address: string): Promise<DefiPosition[]> {
  return discoverV3Positions(chain, address);
}
