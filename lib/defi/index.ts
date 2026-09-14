/**
 * lib/defi/index.ts — aggregator DeFi discovery.
 *
 * Menggabungkan 5 provider: dexscreener, geckoterminal, birdeye, uniswap, sushiswap.
 * - discoverDefiPositions(chain, address): fan-out semua provider yang supportsChain
 * - discoverAllDefi(address, chains): loop per chain, flatten, dedup global, grouping, warnings
 *
 * Tidak throw — selalu kembalikan [] + warnings. Dedup by `${chain}:${protocol}:${poolAddress}` lower.
 * Sort by reserveUsd desc (null paling bawah).
 */

import type { ChainKey } from "../types";
import type { DefiPosition } from "./types";
import { birdeyeDefiProvider } from "./providers/birdeye";
import { dexscreenerDefiProvider } from "./providers/dexscreener";
import { geckoterminalDefiProvider } from "./providers/geckoterminal";
import { sushiswapDefiProvider } from "./providers/sushiswap";
import { uniswapDefiProvider } from "./providers/uniswap";
import type { DefiDiscoveryProvider } from "./types";

export const ALL_PROVIDERS: DefiDiscoveryProvider[] = [
  dexscreenerDefiProvider,
  geckoterminalDefiProvider,
  birdeyeDefiProvider,
  uniswapDefiProvider,
  sushiswapDefiProvider,
];

function sortByReserveDesc(a: DefiPosition, b: DefiPosition): number {
  const av = a.reserveUsd ?? -1;
  const bv = b.reserveUsd ?? -1;
  if (bv !== av) return bv - av;
  // tie-breaker deterministic: protocol + pool
  const ak = `${a.protocol}:${a.poolAddress}`;
  const bk = `${b.protocol}:${b.poolAddress}`;
  return ak.localeCompare(bk);
}

function dedupPositions(positions: DefiPosition[]): DefiPosition[] {
  const seen = new Set<string>();
  const out: DefiPosition[] = [];
  for (const p of positions) {
    if (!p.poolAddress) continue;
    // Chain ikut dalam key: pool address sama di chain berbeda adalah posisi berbeda.
    const key = `${p.chain}:${p.protocol.toLowerCase()}:${p.poolAddress.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * Discover DeFi positions untuk satu chain.
 * Fan-out ke semua provider yang supportsChain(chain), Promise.allSettled, dedup & sort.
 */
export async function discoverDefiPositions(
  chain: ChainKey,
  address: string
): Promise<DefiPosition[]> {
  const lower = address.toLowerCase();
  const eligible = ALL_PROVIDERS.filter((p) => {
    try {
      return p.supportsChain(chain);
    } catch {
      return false;
    }
  });

  if (!eligible.length) return [];

  const settled = await Promise.allSettled(
    eligible.map((p) => p.discoverPositions(chain, lower).catch(() => [] as DefiPosition[]))
  );

  const all: DefiPosition[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      all.push(...r.value);
    }
  }

  const deduped = dedupPositions(all);
  deduped.sort(sortByReserveDesc);
  return deduped;
}

/**
 * Discover DeFi untuk multi-chain.
 * Loop per chain paralel, flatten, global dedup, grouping per chain, kumpulkan warnings.
 */
export async function discoverAllDefi(
  address: string,
  chains: ChainKey[]
): Promise<{
  positions: DefiPosition[];
  byChain: Record<ChainKey, DefiPosition[]>;
  warnings: string[];
}> {
  const lower = address.toLowerCase();
  const warnings: string[] = [];

  // dedup chains input
  const uniqChains = [...new Set(chains.filter(Boolean))] as ChainKey[];
  if (!uniqChains.length) {
    return { positions: [], byChain: {} as Record<ChainKey, DefiPosition[]>, warnings };
  }

  const perChainResults = await Promise.all(
    uniqChains.map(async (chain) => {
      try {
        const positions = await discoverDefiPositions(chain, lower);
        return { chain, positions, error: null as string | null };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { chain, positions: [] as DefiPosition[], error: msg };
      }
    })
  );

  const flattened: DefiPosition[] = [];
  const byChain: Record<string, DefiPosition[]> = {};

  for (const r of perChainResults) {
    if (r.error) {
      warnings.push(`${r.chain}: ${r.error}`);
    }
    // per-provider failures sudah graceful [] via allSettled, tapi tetap catat jika provider ada yang rejected
    // Untuk discoverDefiPositions yang Promise.allSettled, kita tidak punya detail per-provider error di sini.
    // Jika ingin detail, kita bisa panggil ulang; tapi MVP cukup warnings per chain bila total 0 karena error.
    byChain[r.chain] = r.positions;
    flattened.push(...r.positions);
  }

  // capture per-provider failures detail: jalankan cek allSettled per chain untuk warnings granular
  // Hanya jika ada chain yang total 0 tapi warnings kosong, kita tetap tidak menambah noise.
  // Untuk transparansi, kita coba kumpulkan provider-level warnings tanpa memanggil ulang fetcher (cukup skip MVP).

  // global dedup (jika ada pool yang muncul di multi provider dengan protocol sama akan sudah dedup per chain,
  // dan dedup global pun menyertakan chain dalam key — pool address sama di chain berbeda adalah
  // posisi berbeda, jangan sampai ter-drop karena address collision lintas chain).
  const globalDeduped = dedupPositions(flattened);
  globalDeduped.sort(sortByReserveDesc);

  // re-build byChain dari globalDeduped supaya konsisten dengan dedup global
  const rebuiltByChain: Record<string, DefiPosition[]> = {};
  for (const c of uniqChains) rebuiltByChain[c] = [];
  for (const p of globalDeduped) {
    const k = p.chain as string;
    if (rebuiltByChain[k]) rebuiltByChain[k].push(p);
    else rebuiltByChain[k] = [p];
  }
  // sort per chain juga
  for (const k of Object.keys(rebuiltByChain)) {
    rebuiltByChain[k].sort(sortByReserveDesc);
  }

  // warnings dari provider level: kita lakukan pengecekan cepat — jika ada provider yang supportsChain tapi discoverPositions rejected,
  // discoverDefiPositions sudah menelan error jadi warnings tidak terlihat.
  // Untuk memberi sinyal partial, kita tambahkan warning bila ada chain yang tidak didukung sama sekali oleh provider manapun? Tidak perlu.
  // MVP: warnings hanya berisi chain-level error di atas.

  return {
    positions: globalDeduped,
    byChain: rebuiltByChain as Record<ChainKey, DefiPosition[]>,
    warnings,
  };
}
