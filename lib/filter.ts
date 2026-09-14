/**
 * lib/filter.ts — pure helpers untuk Dust/Spam Filter + Search + Sort + Export CSV.
 * Dipakai AssetsTable & FilterBar. Tidak ada efek samping, tidak akses fetch/storage.
 */

import type { PortfolioPosition } from "@/lib/compat";

export type SortBy = "valueDesc" | "valueAsc" | "balanceDesc" | "changeDesc";

export interface FilterState {
  search: string;
  hideDust: boolean;
  hideSuspicious: boolean;
  hideUnpriced: boolean;
  sortBy: SortBy;
  dustThreshold?: number; // default 1
}

export const DEFAULT_DUST_THRESHOLD = 1;

/** Cek search case-insensitive: symbol / name / address (dipakai pipeline filter & counts). */
function matchesSearch(p: PortfolioPosition, q: string): boolean {
  return (
    p.token.symbol.toLowerCase().includes(q) ||
    p.token.name.toLowerCase().includes(q) ||
    p.token.address.toLowerCase().includes(q)
  );
}

/** Token dianggap dust bila berharga dan valueUsd < threshold (unpriced ditangani tahap hideUnpriced). */
function isDust(p: PortfolioPosition, threshold: number): boolean {
  return p.valueUsd !== null && p.valueUsd !== undefined && p.valueUsd < threshold;
}

const DEFAULT_FILTER: FilterState = {
  search: "",
  hideDust: false,
  hideSuspicious: false,
  hideUnpriced: false,
  sortBy: "valueDesc",
  dustThreshold: DEFAULT_DUST_THRESHOLD,
};

/**
 * Filter + sort — pure, tidak mutate `positions`.
 * - search: case-insensitive, cek symbol / name / address
 * - hideDust: sembunyikan valueUsd < threshold (hanya jika valueUsd !== null)
 * - hideSuspicious: sembunyikan suspicious === true
 * - hideUnpriced: sembunyikan valueUsd === null
 * - sortBy: valueDesc | valueAsc | balanceDesc | changeDesc
 */
export function filterAndSortPositions(
  positions: PortfolioPosition[],
  f: Partial<FilterState> | FilterState,
): PortfolioPosition[] {
  const merged: FilterState = { ...DEFAULT_FILTER, ...f };
  const threshold = merged.dustThreshold ?? DEFAULT_DUST_THRESHOLD;
  const q = merged.search.trim().toLowerCase();

  let out = positions.slice();

  if (q) {
    out = out.filter((p) => matchesSearch(p, q));
  }

  if (merged.hideDust) {
    // valueUsd null/undefined di sini TIDAK dibuang — biarkan hideUnpriced yang handle
    out = out.filter((p) => !isDust(p, threshold));
  }

  if (merged.hideSuspicious) {
    out = out.filter((p) => !p.suspicious);
  }

  if (merged.hideUnpriced) {
    out = out.filter((p) => p.valueUsd !== null && p.valueUsd !== undefined);
  }

  switch (merged.sortBy) {
    case "valueDesc":
      out.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));
      break;
    case "valueAsc":
      out.sort((a, b) => {
        const av = a.valueUsd === null || a.valueUsd === undefined ? Number.POSITIVE_INFINITY : a.valueUsd;
        const bv = b.valueUsd === null || b.valueUsd === undefined ? Number.POSITIVE_INFINITY : b.valueUsd;
        return av - bv;
      });
      break;
    case "balanceDesc":
      out.sort((a, b) => b.formatted - a.formatted);
      break;
    case "changeDesc":
      out.sort((a, b) => (b.change24h ?? 0) - (a.change24h ?? 0));
      break;
    default:
      break;
  }

  return out;
}

/**
 * Hitung berapa yang ke-filter per kategori (untuk badge/counts di FilterBar).
 *
 * Dihitung CUMULATIVE mengikuti urutan pipeline filterAndSortPositions
 * (search → hideDust → hideSuspicious → hideUnpriced): token yang sudah
 * tersaring di tahap sebelumnya tidak dihitung ulang di tahap berikutnya,
 * sehingga jumlah badge tidak pernah melebihi total tersembunyi.
 * Kategori dengan toggle OFF selalu 0 — angka berarti "berapa yang akan
 * disembunyikan filter aktif". Contoh: token dust+suspicious dengan kedua
 * toggle on → hiddenDust=1, hiddenSuspicious=0 (sudah terbuang di tahap dust).
 */
export function getFilterCounts(
  positions: PortfolioPosition[],
  f: Partial<FilterState> | FilterState,
): { hiddenDust: number; hiddenSuspicious: number; hiddenUnpriced: number } {
  const merged: FilterState = { ...DEFAULT_FILTER, ...f };
  const threshold = merged.dustThreshold ?? DEFAULT_DUST_THRESHOLD;
  const q = merged.search.trim().toLowerCase();

  // Tahap search selalu jalan di pipeline — menyempitkan kandidat badge.
  let rest = positions.slice();
  if (q) {
    rest = rest.filter((p) => matchesSearch(p, q));
  }

  let hiddenDust = 0;
  let hiddenSuspicious = 0;
  let hiddenUnpriced = 0;

  if (merged.hideDust) {
    hiddenDust = rest.filter((p) => isDust(p, threshold)).length;
    rest = rest.filter((p) => !isDust(p, threshold));
  }
  if (merged.hideSuspicious) {
    hiddenSuspicious = rest.filter((p) => p.suspicious).length;
    rest = rest.filter((p) => !p.suspicious);
  }
  if (merged.hideUnpriced) {
    hiddenUnpriced = rest.filter((p) => p.valueUsd === null || p.valueUsd === undefined).length;
  }
  return { hiddenDust, hiddenSuspicious, hiddenUnpriced };
}

// ───────────────── CSV ─────────────────

function escapeCsvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(positions: PortfolioPosition[]): string {
  const header = ["chain", "symbol", "name", "address", "balance", "priceUsd", "valueUsd", "change24h", "source", "verified"];
  const rows = positions.map((p) =>
    [
      escapeCsvCell(p.chainKey),
      escapeCsvCell(p.token.symbol),
      escapeCsvCell(p.token.name),
      escapeCsvCell(p.token.address),
      escapeCsvCell(p.balance),
      escapeCsvCell(p.priceUsd),
      escapeCsvCell(p.valueUsd),
      escapeCsvCell(p.change24h),
      escapeCsvCell(p.discoverySource ?? p.priceSource),
      escapeCsvCell(p.verified ? "true" : "false"),
    ].join(","),
  );
  return [header.join(","), ...rows].join("\n");
}

export function downloadCsv(csv: string, filename = "assets.csv"): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
