"use client";

import { useState } from "react";
import { ConnectButton } from "@/components/wallet/connect-button";
import { PriceTicker } from "@/components/dashboard/price-ticker";
import { NetworthCard } from "@/components/dashboard/networth-card";
import { ChainGrid } from "@/components/dashboard/chain-grid";
import { AssetsTable } from "@/components/dashboard/assets-table";
import { usePrices } from "@/hooks/usePrices";
import { usePortfolio } from "@/hooks/usePortfolio";

export default function Page() {
  const [address, setAddress] = useState<string | undefined>(undefined);
  const [selectedChain, setSelectedChain] = useState<number | null>(null);

  const { prices, updatedAt: priceUpdatedAt } = usePrices();
  const { data: portfolio, loading } = usePortfolio(address, prices);

  const totalUsd = portfolio?.totalUsd ?? 0;
  const changeUsd = portfolio?.change24hUsd ?? 0;
  const changePct = portfolio?.change24hPct ?? 0;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header — minimal bold */}
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 dark:bg-zinc-950/80 backdrop-blur">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6 h-[64px] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 flex items-center justify-center font-bold text-sm">
              P
            </div>
            <div>
              <p className="text-sm font-bold tracking-tight leading-none">PORTFOLIO</p>
              <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500 leading-none">EVM Real-time</p>
            </div>
            <span className="hidden md:inline-flex ml-3 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 px-2.5 py-1 text-xs font-medium">
              5 chains • Base • BSC • Ink • HYPE • HOOD
            </span>
          </div>
          <ConnectButton onConnect={setAddress} onDisconnect={() => setAddress(undefined)} />
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] w-full px-4 md:px-6 py-6 flex flex-col gap-6">
        {/* Price ticker — real-time oracle */}
        <PriceTicker />

        {/* Hero bento */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-5">
            {loading && !portfolio ? (
              <div className="rounded-[24px] bg-zinc-900 h-[220px] animate-pulse" />
            ) : (
              <NetworthCard totalUsd={totalUsd} changeUsd={changeUsd} changePct={changePct} updatedAt={portfolio?.updatedAt ?? priceUpdatedAt ?? undefined} />
            )}
          </div>
          <div className="lg:col-span-7 rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-widest">Allocation • by chain</h2>
              <span className="text-xs text-zinc-500">{address ? "Live" : "Demo data"} • {portfolio?.positions.length ?? 0} assets</span>
            </div>
            {/* Minimal sparkline placeholder */}
            <div className="h-[110px] rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 flex items-center justify-center overflow-hidden">
              <div className="w-full px-6">
                <div className="flex items-end gap-1.5 h-[60px]">
                  {[18, 32, 22, 44, 28, 52, 36, 48, 30, 58, 42, 62].map((h, i) => (
                    <div key={i} className="flex-1 rounded-t-lg bg-zinc-900 dark:bg-white" style={{ height: `${h}px`, opacity: 0.15 + (i / 12) * 0.85 }} />
                  ))}
                </div>
                <div className="mt-2 flex justify-between text-[11px] uppercase tracking-widest text-zinc-500">
                  <span>7D performance</span>
                  <span className="text-emerald-600">+{changePct.toFixed(2)}%</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
                <p className="uppercase tracking-widest text-zinc-500">Best performer</p>
                <p className="font-semibold mt-1">HYPE • +5.2%</p>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
                <p className="uppercase tracking-widest text-zinc-500">Chains active</p>
                <p className="font-semibold mt-1">5 / 5</p>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
                <p className="uppercase tracking-widest text-zinc-500">Oracle</p>
                <p className="font-semibold mt-1 flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" /> 2s poll</p>
              </div>
            </div>
          </div>
        </div>

        {/* Chain grid */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-widest">Chains</h2>
            {selectedChain && (
              <button onClick={() => setSelectedChain(null)} className="text-xs font-medium underline decoration-zinc-300 underline-offset-4">
                Clear filter
              </button>
            )}
          </div>
          <ChainGrid byChain={portfolio?.byChain ?? {}} selected={selectedChain} onSelect={setSelectedChain} />
        </div>

        {/* Assets */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-widest">Assets {selectedChain ? `• ${selectedChain}` : "• All chains"}</h2>
            <span className="text-xs text-zinc-500">{address ? `Tracking ${address.slice(0, 6)}…` : "Connect wallet for live balances • showing demo"}</span>
          </div>
          {loading && !portfolio ? (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-1/3" />
                <div className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded" />
                <div className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded" />
                <div className="h-10 bg-zinc-100 dark:bg-zinc-800 rounded" />
              </div>
            </div>
          ) : (
            <AssetsTable positions={portfolio?.positions ?? []} filterChain={selectedChain} />
          )}
        </div>

        {/* How real-time works */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h3 className="text-sm font-bold uppercase tracking-widest">How real-time works</h3>
          <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            <div>
              <p className="font-semibold text-zinc-900 dark:text-white">Oracle hybrid</p>
              <p className="mt-1">DeFiLlama primary (2s poll, 1s SWR) + CoinGecko fallback + Pyth WS ready. Timestamp live di ticker.</p>
            </div>
            <div>
              <p className="font-semibold text-zinc-900 dark:text-white">Onchain reads</p>
              <p className="mt-1">multicall per chain (Base/BSC/Ink/HYPE/HOOD) via viem fallback RPC. Balances refresh 8s + on block.</p>
            </div>
            <div>
              <p className="font-semibold text-zinc-900 dark:text-white">Wallet</p>
              <p className="mt-1">Reown AppKit + Privy adapter. Placeholder sudah jalan dengan injected wallet; tinggal isi Project ID untuk WalletConnect.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <a href="/api/prices?ids=ethereum,usd-coin" target="_blank" className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50">GET /api/prices</a>
            <a href="/api/portfolio" target="_blank" className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50">GET /api/portfolio</a>
            <span className="rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-3 py-1.5">NEXT_PUBLIC_REOWN_PROJECT_ID</span>
          </div>
        </div>
      </main>

      <footer className="mt-auto border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <div className="mx-auto max-w-[1280px] px-4 md:px-6 h-14 flex items-center justify-between text-xs text-zinc-500">
          <span>© 2026 Portfolio Dashboard • Minimal bold • Built on Next.js 16</span>
          <span className="hidden sm:inline">Base 8453 • BSC 56 • Ink 57073 • HyperEVM 999 • Robinhood 4663</span>
        </div>
      </footer>
    </div>
  );
}
