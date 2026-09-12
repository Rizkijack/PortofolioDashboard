/**
 * lib/format.ts — helper format lossless.
 *
 * Aturan: alamat publik tampil PENUH; harga tidak diketahui → "—", bukan "$0.00".
 */

import { CHAINS } from "./chains";
import type { ChainKey } from "./types";

export function formatUsd(v: number | null | undefined, opts?: { compact?: boolean }): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  if (opts?.compact && Math.abs(v) >= 1000) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      notation: "compact",
      maximumFractionDigits: 2,
    }).format(v);
  }
  const frac = Math.abs(v) >= 1 ? 2 : Math.abs(v) >= 0.0001 ? 4 : 8;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Math.abs(v) >= 1 ? 2 : 0,
    maximumFractionDigits: frac,
  }).format(v);
}

/** saldo mentah (bigint string) → string desimal lossless. */
export function rawToDecimalString(raw: string, decimals: number): string {
  if (!raw || raw === "0") return "0";
  const neg = raw.startsWith("-");
  const digits = (neg ? raw.slice(1) : raw).padStart(decimals + 1, "0");
  const intPart = digits.slice(0, digits.length - decimals) || "0";
  const fracPart = decimals > 0 ? digits.slice(digits.length - decimals) : "";
  const trimmed = fracPart.replace(/0+$/, "");
  return `${neg ? "-" : ""}${intPart}${trimmed ? "." + trimmed : ""}`;
}

export function formatTokenAmount(
  balance: string,
  opts: { maxFrac?: number; compact?: boolean } = {}
): string {
  const { maxFrac = 6, compact = false } = opts;
  const n = Number(balance);
  if (!Number.isFinite(n)) return balance;
  if (compact && Math.abs(n) >= 1_000_000) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(n);
  }
  if (n !== 0 && Math.abs(n) < 0.000001) return "<0.000001";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: maxFrac,
    minimumFractionDigits: 0,
  }).format(n);
}

export function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function shortenForTable(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function isNativeAddress(addr: string): boolean {
  return addr.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
}

export function explorerAddressUrl(chain: ChainKey, addr: string): string {
  return `${CHAINS[chain].explorer}/address/${addr}`;
}

export function explorerTokenUrl(chain: ChainKey, addr: string): string {
  return `${CHAINS[chain].explorer}/token/${addr}`;
}
