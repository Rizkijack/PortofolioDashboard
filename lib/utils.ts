/**
 * lib/utils.ts — helper format UI.
 *
 * `null` = harga/saldo tidak diketahui → tampil "—" (JANGAN "$0.00").
 * M22 fix: hindari duplikasi — delegasi ke format.ts (single source-of-truth)
 */
import { formatUsd, formatTokenAmount, formatPct as formatPctCanon, shortenForTable, isNativeAddress as isNativeAddressCanon } from "./format";

export function cn(...classes: (string | boolean | undefined | null)[]) {
  return classes.filter(Boolean).join(" ");
}

export function fmtUsd(n: number | null | undefined, opts?: { compact?: boolean }): string {
  return formatUsd(n, opts);
}

export function fmtNumber(n: number | null | undefined, decimals = 4): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  // delegasi ke formatTokenAmount dengan string, tapi jaga signature number
  return formatTokenAmount(String(n), { maxFrac: decimals });
}

export function fmtPct(n: number | null | undefined): string {
  return formatPctCanon(n);
}

export function shortAddr(addr: string): string {
  // pakai shortenForTable canon tapi jaga kompatibilitas "..." vs "…"
  const s = shortenForTable(addr);
  return s.replace("…", "...");
}

export { isNativeAddressCanon as isNativeAddress };
