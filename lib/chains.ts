/**
 * lib/chains.ts — registry 5 chain (nama export lama DIPERTAHANKAN supaya
 * komponen UI yang sudah ada tetap kompilasi).
 *
 * RPC di bawah sudah diverifikasi hidup. Yang mati sudah dibuang:
 *   mainnet.rpc.robinhoodchain.io  → tidak merespons (diganti publicnode)
 *   base.llamarpc.com / bsc.llamarpc.com → HTTP 525 (dibuang)
 */

import { defineChain } from "viem";
import { base as baseViem, bsc as bscViem } from "viem/chains";
import type { ChainKey, ChainMeta } from "./types";

const env = (key: string): string | undefined => {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : undefined;
};

// ─────────────────────────── definisi viem ───────────────────────────

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [env("NEXT_PUBLIC_RPC_ROBINHOOD") ?? "https://robinhood-rpc.publicnode.com"] },
  },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: "https://robinhoodchain.blockscout.com" },
  },
});

export const base = defineChain({
  id: 8453,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [env("NEXT_PUBLIC_RPC_BASE") ?? "https://mainnet.base.org"] } },
  blockExplorers: { default: { name: "BaseScan", url: "https://basescan.org" } },
});

export const bsc = defineChain({
  id: 56,
  name: "BNB Smart Chain",
  nativeCurrency: { name: "BNB", symbol: "BNB", decimals: 18 },
  rpcUrls: {
    default: { http: [env("NEXT_PUBLIC_RPC_BSC") ?? "https://bsc-dataseed.binance.org"] },
  },
  blockExplorers: { default: { name: "BscScan", url: "https://bscscan.com" } },
});

export const hyperEVM = defineChain({
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: { http: [env("NEXT_PUBLIC_RPC_HYPEREVM") ?? "https://rpc.hyperliquid.xyz/evm"] },
  },
  blockExplorers: { default: { name: "HyperEVMScan", url: "https://hyperevmscan.io" } },
});

export const ink = defineChain({
  id: 57073,
  name: "Ink",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: [env("NEXT_PUBLIC_RPC_INK") ?? "https://rpc-gel.inkonchain.com"] },
  },
  blockExplorers: { default: { name: "Ink Explorer", url: "https://explorer.inkonchain.com" } },
});

export const VIEM_CHAINS = { robinhood: robinhoodChain, base, bsc, hyperevm: hyperEVM, ink } as const;

/** Nama lama — dipakai komponen UI. */
export const hyperEVMChain = hyperEVM;
export const viemCanonical = { base: baseViem, bsc: bscViem };

// ─────────────────────────── metadata ───────────────────────────

export const CHAIN_ORDER: ChainKey[] = ["robinhood", "base", "bsc", "hyperevm", "ink"];

export const CHAINS: Record<ChainKey, ChainMeta> = {
  robinhood: {
    key: "robinhood",
    chainId: 4663,
    hexChainId: "0x1237",
    name: "Robinhood Chain",
    shortName: "Robinhood",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    dexscreenerSlug: "robinhood",
    explorer: "https://robinhoodchain.blockscout.com",
    color: "#00C805",
    // Robinhood L2 finality ~100 detik — blockTime mencerminkan periode blok ~101s
    blockTimeMs: 101_000,
  },
  base: {
    key: "base",
    chainId: 8453,
    hexChainId: "0x2105",
    name: "Base",
    shortName: "Base",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    dexscreenerSlug: "base",
    explorer: "https://basescan.org",
    color: "#0052FF",
    blockTimeMs: 2_000,
  },
  bsc: {
    key: "bsc",
    chainId: 56,
    hexChainId: "0x38",
    name: "BNB Smart Chain",
    shortName: "BSC",
    nativeSymbol: "BNB",
    nativeDecimals: 18,
    dexscreenerSlug: "bsc",
    explorer: "https://bscscan.com",
    color: "#F0B90B",
    blockTimeMs: 3_000,
  },
  hyperevm: {
    key: "hyperevm",
    chainId: 999,
    hexChainId: "0x3e7",
    name: "HyperEVM",
    shortName: "HyperEVM",
    nativeSymbol: "HYPE",
    nativeDecimals: 18,
    dexscreenerSlug: "hyperevm",
    explorer: "https://hyperevmscan.io",
    color: "#00E5A0",
    blockTimeMs: 1_000,
  },
  ink: {
    key: "ink",
    chainId: 57073,
    hexChainId: "0xdef1",
    name: "Ink",
    shortName: "Ink",
    nativeSymbol: "ETH",
    nativeDecimals: 18,
    dexscreenerSlug: "ink",
    explorer: "https://explorer.inkonchain.com",
    color: "#7132F5",
    blockTimeMs: 1_000,
  },
};

/** Failover RPC — hanya yang terverifikasi hidup (probe POST eth_chainId, catatan hasil di baris masing-masing). */
export const RPC_FAILOVER: Record<ChainKey, string[]> = {
  robinhood: ["https://robinhood-rpc.publicnode.com", "https://robinhood.drpc.org"],
  // 1rpc.io/base & base.drpc.org: hidup, chainId 0x2105 (probe 2026-09-14); kandidat lain base sudah cukup 2
  base: ["https://mainnet.base.org", "https://1rpc.io/base", "https://base.drpc.org"],
  // bsc.publicnode.com: hidup, chainId 0x38 (probe 2026-09-14); bsc.drpc.org kena rate limit → tidak ditambahkan
  bsc: ["https://bsc-dataseed.binance.org", "https://bsc.publicnode.com"],
  hyperevm: ["https://rpc.hyperliquid.xyz/evm", "https://hyperliquid.drpc.org"],
  ink: ["https://rpc-gel.inkonchain.com", "https://rpc-qnd.inkonchain.com", "https://ink.drpc.org"],
};

/** Nama lama — dipakai komponen UI (urutan: UI lama mengharapkan Base dulu). */
export const supportedChains = [base, bsc, ink, hyperEVM, robinhoodChain] as const;

export const chainMeta: Record<number, { color: string; short: string; icon: string }> = {
  8453: { color: CHAINS.base.color, short: "BASE", icon: "B" },
  56: { color: CHAINS.bsc.color, short: "BSC", icon: "B" },
  57073: { color: CHAINS.ink.color, short: "INK", icon: "I" },
  999: { color: CHAINS.hyperevm.color, short: "HYPE", icon: "H" },
  4663: { color: CHAINS.robinhood.color, short: "HOOD", icon: "R" },
};

export function getChainById(id: number) {
  return supportedChains.find((c) => c.id === id) || null;
}

export function chainByKey(key: string): ChainMeta | null {
  return (CHAINS as Record<string, ChainMeta>)[key] ?? null;
}

export function chainById(id: number): ChainMeta | null {
  return CHAIN_ORDER.map((k) => CHAINS[k]).find((c) => c.chainId === id) ?? null;
}

export function parseChainKeys(csv: string | null | undefined): ChainKey[] {
  if (!csv) return [...CHAIN_ORDER];
  const wanted = csv.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const valid = wanted.filter((w): w is ChainKey => (CHAIN_ORDER as string[]).includes(w));
  return valid.length ? valid : [...CHAIN_ORDER];
}

// ─────────────────────────── konstanta alamat ───────────────────────────

// M19 fix: verifikasi per-chain — 0xcA11... terdeploy di semua 5 chain (verified 2026-09-14)
// Tetap sediakan map per-chain agar mudah ganti bila satu chain belum deploy
export const MULTICALL3_BY_CHAIN: Record<ChainKey, `0x${string}`> = {
  robinhood: "0xcA11bde05977b3631167028862bE2a173976CA11",
  base: "0xcA11bde05977b3631167028862bE2a173976CA11",
  bsc: "0xcA11bde05977b3631167028862bE2a173976CA11",
  hyperevm: "0xcA11bde05977b3631167028862bE2a173976CA11",
  ink: "0xcA11bde05977b3631167028862bE2a173976CA11",
};
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

export const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function isAddress(v: string | null | undefined): v is `0x${string}` {
  return !!v && ADDRESS_RE.test(v);
}
