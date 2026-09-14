"use client";

import { useMemo, useState, useCallback } from "react";
import { ConnectButton } from "@/components/wallet/connect-button";
import { PriceTicker } from "@/components/dashboard/price-ticker";
import { NetworthCard } from "@/components/dashboard/networth-card";
import { ChainGrid } from "@/components/dashboard/chain-grid";
import { AssetsTable } from "@/components/dashboard/assets-table";
import { FilterBar } from "@/components/dashboard/filter-bar";
import { HistoryChart } from "@/components/dashboard/history-chart";
import { TxHistory } from "@/components/dashboard/tx-history";
import { DefiPositions } from "@/components/dashboard/defi-positions";
import { TokenDetailModal } from "@/components/dashboard/token-detail-modal";
import { AddressBar } from "@/components/dashboard/address-bar";
import { AssetAllocationBento } from "@/components/dashboard/asset-allocation-bento";
import { usePrices } from "@/hooks/usePrices";
import { usePortfolio } from "@/hooks/usePortfolio";
import { fmtPct } from "@/lib/utils";
import { isAddress } from "@/lib/chains";
import type { PortfolioPosition } from "@/lib/compat";
import { filterAndSortPositions, getFilterCounts, type FilterState } from "@/lib/filter";

const DEFAULT_FILTERS: FilterState = {
  search: "",
  hideDust: false,
  hideSuspicious: false,
  hideUnpriced: false,
  sortBy: "valueDesc",
  dustThreshold: 1,
};

export default function HomePage() {
  const [activeAddress, setActiveAddress] = useState<string | undefined>(() => {
    if (typeof window === "undefined") return undefined;
    const sp = new URLSearchParams(window.location.search);
    const queryAddr = sp.get("address");
    return queryAddr && isAddress(queryAddr) ? queryAddr : undefined;
  });
  const [connectedAddress, setConnectedAddress] = useState<string | undefined>(undefined);
  const [selectedChain, setSelectedChain] = useState<number | null>(null);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [selectedPosition, setSelectedPosition] = useState<PortfolioPosition | null>(null);

  // Update active address & URL search param
  const handleSelectAddress = useCallback((addr: string | undefined) => {
    setActiveAddress(addr);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (addr && isAddress(addr)) {
        url.searchParams.set("address", addr);
      } else {
        url.searchParams.delete("address");
      }
      window.history.pushState({}, "", url.toString());
    }
  }, []);

  const handleWalletConnect = useCallback(
    (walletAddr: string) => {
      setConnectedAddress(walletAddr);
      // Jika sebelumnya belum ada address manual yang dipantau, otomatis ikuti wallet
      if (!activeAddress) {
        handleSelectAddress(walletAddr);
      }
    },
    [activeAddress, handleSelectAddress]
  );

  const handleWalletDisconnect = useCallback(() => {
    setConnectedAddress(undefined);
    // Jika activeAddress sama dengan wallet yang didisconnect, reset activeAddress
    if (activeAddress && connectedAddress && activeAddress.toLowerCase() === connectedAddress.toLowerCase()) {
      handleSelectAddress(undefined);
    }
  }, [activeAddress, connectedAddress, handleSelectAddress]);

  const { updatedAt: priceUpdatedAt } = usePrices();
  const { data: portfolio, loading, streamLive } = usePortfolio(activeAddress);

  const totalUsd = portfolio?.totalUsd ?? 0;
  const changeUsd = portfolio?.change24hUsd ?? 0;
  const changePct = portfolio?.change24hPct ?? 0;

  // Best performer NYATA: posisi dengan perubahan 24 jam terbesar (bukan angka karangan).
  const bestPerformer = (portfolio?.positions ?? [])
    .filter((p) => p.valueUsd !== null && p.change24h !== 0)
    .sort((a, b) => b.change24h - a.change24h)[0];

  const warnings = portfolio?.warnings ?? [];

  // Chain yang benar-benar punya nilai (bukan klaim "5/5").
  const activeChains = Object.values(portfolio?.byChain ?? {}).filter((c) => c.count > 0).length;

  // Filtered positions untuk FilterBar counts & export
  const allPositions = useMemo(() => portfolio?.positions ?? [], [portfolio?.positions]);
  const filterCounts = useMemo(() => getFilterCounts(allPositions, filters), [allPositions, filters]);
  const filteredForDisplay = useMemo(() => {
    const filtered = filterAndSortPositions(allPositions, filters);
    return selectedChain ? filtered.filter((p) => p.chainId === selectedChain) : filtered;
  }, [allPositions, filters, selectedChain]);

  const countsForBar = useMemo(
    () => ({
      total: allPositions.length,
      filtered: filteredForDisplay.length,
      hiddenDust: filterCounts.hiddenDust,
      hiddenSuspicious: filterCounts.hiddenSuspicious,
    }),
    [allPositions.length, filteredForDisplay.length, filterCounts.hiddenDust, filterCounts.hiddenSuspicious]
  );

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
          <ConnectButton onConnect={handleWalletConnect} onDisconnect={handleWalletDisconnect} />
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] w-full px-4 md:px-6 py-6 flex flex-col gap-6">
        {/* Manual Address Bar & Watchlist Switcher */}
        <AddressBar
          currentAddress={activeAddress}
          connectedWalletAddress={connectedAddress}
          onSelectAddress={handleSelectAddress}
        />

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
              <span className="text-xs text-zinc-500">
                {activeAddress ? (streamLive ? "Stream live" : "Live") : "Belum ada wallet"} •{" "}
                {portfolio?.positions.length ?? 0} aset
              </span>
            </div>
            {/* Alokasi nyata per chain — bar proporsional terhadap total */}
            <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 p-5 flex flex-col justify-center gap-3 min-h-[110px]">
              {!portfolio || portfolio.positions.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  {activeAddress ? "Memuat alokasi on-chain…" : "Connect wallet atau masukkan alamat di atas untuk melihat alokasi per chain."}
                </p>
              ) : (
                <>
                  <div className="flex items-end gap-1.5 h-[60px]">
                    {portfolio.allocation.map((a) => (
                      <div
                        key={a.chainKey}
                        title={`${a.chainKey} • ${a.pct.toFixed(1)}%`}
                        className="flex-1 rounded-t-lg bg-zinc-900 dark:bg-white transition-all"
                        style={{ height: `${Math.max(6, a.pct)}px`, opacity: 0.3 + (a.pct / 100) * 0.7 }}
                      />
                    ))}
                  </div>
                  <div className="flex justify-between text-[11px] uppercase tracking-widest text-zinc-500">
                    <span>Allocation • {portfolio.allocation.length} chains</span>
                    <span className="text-emerald-600">{fmtPct(portfolio.change24hPct)} / 24h</span>
                  </div>
                </>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
                <p className="uppercase tracking-widest text-zinc-500">Best performer</p>
                <p className="font-semibold mt-1">
                  {bestPerformer
                    ? `${bestPerformer.token.symbol} • ${bestPerformer.change24h >= 0 ? "+" : ""}${bestPerformer.change24h.toFixed(2)}%`
                    : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
                <p className="uppercase tracking-widest text-zinc-500">Chains active</p>
                <p className="font-semibold mt-1">{activeChains} / 5</p>
              </div>
              <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-3">
                <p className="uppercase tracking-widest text-zinc-500">Oracle</p>
                <p className="font-semibold mt-1 flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${activeAddress ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"}`} />
                  {activeAddress ? (streamLive ? "SSE push" : "polling") : "idle"}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Allocation by asset class — klasifikasi kategori + profil risiko (komputasi klien) */}
        <div className="grid grid-cols-1 gap-4">
          <AssetAllocationBento portfolio={portfolio} loading={loading} hasAddress={Boolean(activeAddress)} />
        </div>

        {/* Net worth history chart — 7d/30d/90d */}
        <HistoryChart address={activeAddress} />

        {/* Peringatan chain parsial — transparan, bukan angka diam-diam */}
        {warnings.length > 0 && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
            <span className="font-semibold uppercase tracking-widest">Partial data • </span>
            {warnings.slice(0, 3).join(" — ")}
            {warnings.length > 3 ? ` (+${warnings.length - 3} lagi)` : ""}
          </div>
        )}

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
            <span className="text-xs text-zinc-500">{activeAddress ? `Tracking ${activeAddress.slice(0, 6)}…` : "Connect wallet untuk saldo live on-chain"}</span>
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
            <>
              <FilterBar filters={filters} onChange={setFilters} counts={countsForBar} filteredPositions={filteredForDisplay} />
              <div className="mt-4">
                <AssetsTable
                  positions={portfolio?.positions ?? []}
                  filterChain={selectedChain}
                  search={filters.search}
                  hideDust={filters.hideDust}
                  hideSuspicious={filters.hideSuspicious}
                  hideUnpriced={filters.hideUnpriced}
                  sortBy={filters.sortBy}
                  dustThreshold={filters.dustThreshold}
                  onSelectPosition={setSelectedPosition}
                />
              </div>
            </>
          )}
        </div>

        {/* Transaction History */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-widest">Transactions</h2>
            <span className="text-xs text-zinc-500">{activeAddress ? "On-chain history" : "Connect wallet"}</span>
          </div>
          <TxHistory address={activeAddress} />
        </div>

        {/* DeFi Positions — Uniswap / SushiSwap / DexScreener / GeckoTerminal / Birdeye */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-widest">DeFi Positions</h2>
            <span className="text-xs text-zinc-500">{activeAddress ? "LP • Vault • Staking" : "Connect wallet"}</span>
          </div>
          <DefiPositions address={activeAddress} />
        </div>

        {/* How real-time works */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
          <h3 className="text-sm font-bold uppercase tracking-widest">How real-time works</h3>
          <div className="mt-4 grid md:grid-cols-3 gap-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            <div>
              <p className="font-semibold text-zinc-900 dark:text-white">Oracle berlapis</p>
              <p className="mt-1">Chainlink on-chain → RedStone push (Ink) → Binance WS stream → RedStone API → DexScreener → Blockscout rate. Tanpa harga → “—”, bukan karangan.</p>
            </div>
            <div>
              <p className="font-semibold text-zinc-900 dark:text-white">Onchain reads</p>
              <p className="mt-1">Discovery via Blockscout v2 / Routescan, saldo via eth_getBalance + multicall balanceOf per chain dengan RPC failover. Push via SSE /api/stream.</p>
            </div>
            <div>
              <p className="font-semibold text-zinc-900 dark:text-white">DeFi</p>
              <p className="mt-1">LP/Vault discovery via Uniswap V2/V3, SushiSwap, DexScreener, GeckoTerminal, Birdeye (opsional BIRDEYE_API_KEY). Agregasi + dedup per pool.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs">
            <a href="/api/prices?ids=ethereum,usd-coin" target="_blank" className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50">GET /api/prices</a>
            <a href="/api/chains" target="_blank" className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50">GET /api/chains</a>
            <a href="/api/tx?address=0x3b19C7158372Efa5A576618d6a26aA3E6c8dD9B2&limit=5" target="_blank" className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50">GET /api/tx</a>
            <a href="/api/history?address=0x3b19C7158372Efa5A576618d6a26aA3E6c8dD9B2&range=7d" target="_blank" className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50">GET /api/history</a>
            <a href="/api/defi?address=0x3b19C7158372Efa5A576618d6a26aA3E6c8dD9B2" target="_blank" className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 hover:bg-zinc-50">GET /api/defi</a>
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

      {/* Token Detail Modal (TradingView + Multi-Source Metrics) */}
      {selectedPosition && (
        <TokenDetailModal
          position={selectedPosition}
          ownerAddress={activeAddress}
          onClose={() => setSelectedPosition(null)}
        />
      )}
    </div>
  );
}