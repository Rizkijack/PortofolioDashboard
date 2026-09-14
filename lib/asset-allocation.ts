/**
 * lib/asset-allocation.ts — klasifikasi kategori aset & profil risiko portofolio.
 *
 * Pure functions: tanpa React, tanpa network, tanpa state. Input hanya
 * `PortfolioPosition[]` dari lib/compat.ts (data nyata, 0 request tambahan).
 * Filosofi repo: `valueUsd` null = tidak diketahui (bukan 0) — posisi tanpa
 * harga TIDAK pernah dikarang nilainya dan tidak memengaruhi total/pct/skor.
 */

import type { PortfolioPosition } from "./compat";
import { CANONICAL_TOKENS } from "./oracle/canonical-tokens";

/** Kategori aset untuk breakdown alokasi. */
export type AssetCategory = "stable" | "major" | "defi" | "ecosystem";

/** Satu potongan alokasi per kategori. */
export interface CategorySlice {
  category: AssetCategory;
  /** Label siap-tampil (sinkron dengan legend UI). */
  label: string;
  /** Total nilai USD posisi berharga dalam kategori (null tidak dijumlahkan). */
  valueUsd: number;
  /** Porsi terhadap total bernilai, 0–100 (0 jika totalUsd = 0). */
  pct: number;
  /** Jumlah aset dalam kategori, termasuk yang belum berharga. */
  count: number;
  /** Maks 3 symbol terbesar dalam kategori (untuk tooltip/legend). */
  topSymbols: string[];
}

/** Profil risiko stabil vs volatil dengan skor transparan 0–100. */
export interface RiskProfile {
  /** Porsi stablecoin (%) — dianggap defensif. */
  defensivePct: number;
  /** 100 − defensivePct; major/defi/ecosystem dihitung volatil. */
  volatilePct: number;
  /** Skor tertimbang 0–100: stable=0, major=25, defi=60, ecosystem=100. */
  score: number;
  verdict: "defensive" | "balanced" | "aggressive";
}

/** Hasil agregasi alokasi untuk satu portofolio. */
export interface AllocationBreakdown {
  slices: CategorySlice[];
  /** Hanya posisi dengan valueUsd !== null. */
  totalUsd: number;
  risk: RiskProfile;
  /**
   * Nilai USD aset yang tidak masuk breakdown. Posisi `valueUsd` null tidak
   * diketahui nilainya → TIDAK pernah dikarang, selalu 0 (tampil "—" di UI).
   * Lihat `unclassifiedCount` untuk jumlah aset tanpa harga.
   */
  unclassifiedValueUsd: number;
  /** Jumlah aset tanpa harga (valueUsd null) — pelengkap transparansi UI. */
  unclassifiedCount: number;
}

/** Set symbol stablecoin (uppercase, trim) — mencakup varian umum lintas chain. */
const STABLE_SYMBOLS: ReadonlySet<string> = new Set([
  "USDC",
  "USDT",
  "USDS",
  "USDG",
  "DAI",
  "FDUSD",
  "TUSD",
  "USDE",
  "USDC.E",
  "BUSD",
  "USDD",
  "GUSD",
  "USDP",
  "PYUSD",
  "FRAX",
  "LUSD",
  "SUSD",
  "USD₮0",
  "SYRUPUSDG",
  "USDB",
  "USDX",
  // Yield-bearing stable umum (varian deposito / liquid staking USD).
  "SUSDE",
  "SUSDS",
  // "U" = United Stables (ticker 1 huruf, canonical Robinhood). Risiko false
  // positive rendah di 5 chain yang didukung, manfaat disambiguasinya besar.
  "U",
]);

/** Set symbol aset major (uppercase) — native/L1 blue chip + wrapped/BTC/ETH + LST ETH. */
const MAJOR_SYMBOLS: ReadonlySet<string> = new Set([
  "ETH",
  "WETH",
  "BNB",
  "WBNB",
  "BTC",
  "WBTC",
  "CBBTC",
  "BTCB",
  "HYPE",
  // Liquid staking / wrapped ETH — eksposur setara ETH, bukan LP.
  "STETH",
  "WSTETH",
  "CBETH",
  "WEETH",
  "RETH",
]);

/**
 * Prefix LP umum — dicocokkan case-insensitive terhadap symbol uppercase.
 * WAJIB mengandung tanda hubung ("STK-XXX", bukan "STK") agar ticker seperti
 * STETH / STONE / STG / STRK tidak salah masuk kategori defi.
 */
const LP_PREFIXES_CASE_INSENSITIVE = ["UNI-", "CAKE-", "SUSHI-", "STK-", "ST-"] as const;

/**
 * Prefix LP pendek ("v" Velodrome/Aerodrome) — case-SENSITIVE lowercase agar
 * ticker uppercase seperti "VET" tidak salah masuk kategori defi.
 */
const LP_PREFIXES_CASE_SENSITIVE = ["v"] as const;

/** Label siap-tampil per kategori (dipakai legend UI). */
const CATEGORY_LABELS: Record<AssetCategory, string> = {
  stable: "Stablecoins",
  major: "Major & Native",
  defi: "DeFi LP & Vaults",
  ecosystem: "Ecosystem & Long-tail",
};

/** Bobot risiko 0–100 per kategori (transparan, bukan black-box). */
const RISK_WEIGHTS: Record<AssetCategory, number> = {
  stable: 0,
  major: 25,
  defi: 60,
  ecosystem: 100,
};

/** Urutan tetap slice (donut & legend konsisten). */
const CATEGORY_ORDER: AssetCategory[] = ["stable", "major", "defi", "ecosystem"];

/**
 * Klasifikasikan satu posisi ke kategori aset.
 *
 * Urutan prioritas (paling presisi → paling longgar):
 * 1. Sinyal defi eksplisit: `protocol`, pool "A/B", akhiran " LP".
 * 2. Exact-match set: stable → major (symptom ticker seperti "STETH" dianggap
 *    major, bukan LP — prefix longgar selalu dievaluasi PALING AKHIR).
 * 3. Disambiguasi symbol ambigu via token canonical per chain (address lower).
 * 4. Prefix LP longgar (harus unik, mis. "UNI-", "v").
 * 5. Default: ecosystem.
 */
export function classifyPosition(p: PortfolioPosition): AssetCategory {
  const symbol = p.token.symbol.trim();
  const upper = symbol.toUpperCase();

  // 1) DeFi eksplisit: ada protokol, pool "A/B", atau akhiran " LP".
  if (p.protocol) return "defi";
  if (upper.includes("/")) return "defi";
  if (upper.endsWith(" LP")) return "defi";

  // Disambiguasi symbol ambigu via token canonical per chain (address lowercase).
  // Contoh: "U" di robinhood = United Stables (stable), WETH/CBBTC canonical.
  const canonical = CANONICAL_TOKENS[p.chainKey]?.[p.token.address.toLowerCase()];

  // 2) Stable: symbol di set, ATAU canonical symbol-nya stable.
  if (STABLE_SYMBOLS.has(upper)) return "stable";
  if (canonical && STABLE_SYMBOLS.has(canonical.symbol.toUpperCase())) return "stable";

  // 3) Major: token native SELALU major; sisanya via set / canonical.
  if (p.isNative) return "major";
  if (MAJOR_SYMBOLS.has(upper)) return "major";
  if (canonical && MAJOR_SYMBOLS.has(canonical.symbol.toUpperCase())) return "major";

  // 4) Prefix LP longgar — terakhir, agar tidak menelan ticker umum
  //    (STETH, STONE, STG, STRK, VET, CAKE, UNI tidak lolos ke sini).
  if (LP_PREFIXES_CASE_INSENSITIVE.some((pre) => upper.startsWith(pre))) return "defi";
  if (LP_PREFIXES_CASE_SENSITIVE.some((pre) => symbol.startsWith(pre))) return "defi";

  // 5) Ecosystem: default — saham Robinhood (INTC, MSFT, TSLA…), meme, long-tail.
  return "ecosystem";
}

/**
 * Agregasi posisi menjadi breakdown alokasi + profil risiko.
 * Hanya posisi berharga (`valueUsd !== null`) masuk total/pct/skor; posisi
 * tanpa harga tetap dihitung di `count` kategorinya dan dilaporkan terpisah.
 */
export function buildAllocationBreakdown(positions: PortfolioPosition[]): AllocationBreakdown {
  let totalUsd = 0;
  for (const p of positions) {
    if (p.valueUsd !== null) totalUsd += p.valueUsd;
  }

  // Akumulator per kategori.
  const acc = new Map<AssetCategory, { valueUsd: number; count: number; top: Map<string, number> }>();
  for (const cat of CATEGORY_ORDER) acc.set(cat, { valueUsd: 0, count: 0, top: new Map() });

  const unclassifiedValueUsd = 0; // nilai tak diketahui → 0 (lihat JSDoc interface)
  let unclassifiedCount = 0;

  for (const p of positions) {
    const cat = classifyPosition(p);
    const a = acc.get(cat);
    if (!a) continue;
    a.count += 1;
    if (p.valueUsd === null) {
      unclassifiedCount += 1;
      continue; // tidak memengaruhi total, pct, maupun skor risiko
    }
    a.valueUsd += p.valueUsd;
    // Akumulasi simbol yang sama lintas posisi/chain (mis. USDC di 2 chain).
    a.top.set(p.token.symbol, (a.top.get(p.token.symbol) ?? 0) + p.valueUsd);
  }

  const safeTotal = totalUsd > 0 ? totalUsd : 0;

  const slices: CategorySlice[] = CATEGORY_ORDER.map((cat) => {
    const a = acc.get(cat)!;
    const pct = safeTotal > 0 ? (a.valueUsd / safeTotal) * 100 : 0;
    const topSymbols = [...a.top.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, 3)
      .map(([sym]) => sym);
    return {
      category: cat,
      label: CATEGORY_LABELS[cat],
      valueUsd: a.valueUsd,
      pct,
      count: a.count,
      topSymbols,
    };
  });

  // Profil risiko: stable = defensif; major/defi/ecosystem dihitung volatil.
  const stablePct = slices.find((s) => s.category === "stable")?.pct ?? 0;
  const defensivePct = stablePct;
  const volatilePct = 100 - defensivePct;

  // Skor tertimbang transparan 0–100: score = Σ(pct × weight) / 100, 1 desimal.
  const rawScore = slices.reduce((sum, s) => sum + s.pct * RISK_WEIGHTS[s.category], 0) / 100;
  const score = Math.round(rawScore * 10) / 10;
  const verdict = score < 35 ? "defensive" : score > 65 ? "aggressive" : "balanced";

  return {
    slices,
    totalUsd: safeTotal,
    risk: { defensivePct, volatilePct, score, verdict },
    unclassifiedValueUsd,
    unclassifiedCount,
  };
}
