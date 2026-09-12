/**
 * lib/utils.ts — helper format UI.
 *
 * `null` = harga/saldo tidak diketahui → tampil "—" (JANGAN "$0.00").
 */

export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function fmtUsd(n: number | null | undefined, opts?: { compact?: boolean }): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (opts?.compact && Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(n);
  }
  const frac = Math.abs(n) >= 1 ? 2 : Math.abs(n) >= 0.0001 ? 4 : 8;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Math.abs(n) >= 1 ? 2 : 0,
    maximumFractionDigits: frac,
  }).format(n);
}

export function fmtNumber(n: number | null | undefined, decimals = 4) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n !== 0 && Math.abs(n) < 0.000001) return "<0.000001";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  }).format(n);
}

export function fmtPct(n: number | null | undefined) {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
