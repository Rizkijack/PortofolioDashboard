"use client";

import { useDefi } from "@/hooks/useDefi";
import { CHAINS } from "@/lib/chains";
import { fmtUsd } from "@/lib/utils";
import type { ChainKey } from "@/lib/types";

function explorerPoolUrl(chain: ChainKey, poolAddress: string): string {
  const base = CHAINS[chain]?.explorer ?? "";
  // pools umumnya di /address/{pool}
  return `${base}/address/${poolAddress}`;
}

export function DefiPositions({
  address,
  chains,
}: {
  address?: string;
  chains?: ChainKey[];
}) {
  const { data, byChain, warnings, loading, error, refresh } = useDefi(address, { chains });

  // No wallet connected
  if (!address) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-lg">
          ◈
        </div>
        <p className="text-sm font-medium text-zinc-900 dark:text-white">
          Connect wallet untuk melihat DeFi positions
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          LP / Vault positions dari Uniswap, SushiSwap, dan provider lain akan muncul di sini.
        </p>
      </div>
    );
  }

  // Loading skeleton
  if (loading && data === null) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="h-5 w-32 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          <div className="h-4 w-20 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-14 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Error
  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-white dark:bg-zinc-900 p-6">
        <p className="text-sm font-medium text-red-600 dark:text-red-400">Gagal memuat DeFi positions</p>
        <p className="mt-1 text-xs text-zinc-500">{error}</p>
        <button
          onClick={refresh}
          className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
        >
          Coba lagi
        </button>
        {warnings.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Warnings</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-amber-700 dark:text-amber-400">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // Empty — belum ada LP
  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">Belum ada LP positions</p>
        <p className="mt-1 text-xs text-zinc-500">
          Tidak ditemukan Liquidity Pool positions untuk wallet ini di chain terpilih.
        </p>
        {warnings.length > 0 && (
          <div className="mt-4 text-left rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Warnings</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-amber-700 dark:text-amber-400">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}
        <button
          onClick={refresh}
          className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition"
        >
          Refresh
        </button>
      </div>
    );
  }

  // Data table / cards
  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">DeFi Positions</h3>
          <p className="text-xs text-zinc-500">
            {data.length} pool{data.length > 1 ? "s" : ""} • {byChain ? Object.keys(byChain).length : 0} chains
          </p>
        </div>
        <button
          onClick={refresh}
          className="rounded-lg border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 transition disabled:opacity-50"
          disabled={loading}
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <tr className="text-left text-xs uppercase tracking-widest text-zinc-500">
              <th className="px-4 py-3 font-medium">Pool</th>
              <th className="px-4 py-3 font-medium">Protocol</th>
              <th className="px-4 py-3 font-medium">Chain</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium text-right">TVL / Reserve</th>
              <th className="px-4 py-3 font-medium text-center">Explorer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {data.map((p) => {
              const meta = CHAINS[p.chain];
              return (
                <tr
                  key={`${p.protocol}:${p.poolAddress}`}
                  className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/50"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-zinc-900 dark:text-white leading-none">{p.symbol}</div>
                    <div className="text-xs text-zinc-500 mt-0.5 truncate max-w-[220px]">{p.name}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-2 py-0.5 text-[11px] font-medium">
                      {p.protocol}
                    </span>
                    {p.dexId && p.dexId !== p.protocol && (
                      <span className="ml-1 text-[10px] text-zinc-400">{p.dexId}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                      style={{
                        borderColor: meta?.color ? `${meta.color}40` : undefined,
                        background: meta?.color ? `${meta.color}12` : undefined,
                      }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: meta?.color ?? "#999" }} />
                      {meta?.shortName ?? p.chain}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-600 dark:text-zinc-400">
                      {p.type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-900 dark:text-white">
                    {fmtUsd(p.reserveUsd)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <a
                      href={explorerPoolUrl(p.chain, p.poolAddress)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
                      title="View pool on explorer"
                    >
                      ↗
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden p-4 grid gap-3">
        {data.map((p) => {
          const meta = CHAINS[p.chain];
          return (
            <div
              key={`${p.protocol}:${p.poolAddress}-card`}
              className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-zinc-50/50 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{p.symbol}</p>
                  <p className="text-xs text-zinc-500 truncate">{p.name}</p>
                </div>
                <span className="shrink-0 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-2 py-0.5 text-[11px] font-medium">
                  {p.protocol}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                  style={{
                    borderColor: meta?.color ? `${meta.color}40` : undefined,
                    background: meta?.color ? `${meta.color}12` : undefined,
                  }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: meta?.color ?? "#999" }} />
                  {meta?.shortName ?? p.chain}
                </span>
                <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs font-mono text-zinc-600 dark:text-zinc-400">
                  {p.type}
                </span>
                <span className="ml-auto text-sm font-mono font-medium text-zinc-900 dark:text-white">
                  {fmtUsd(p.reserveUsd)}
                </span>
              </div>
              <a
                href={explorerPoolUrl(p.chain, p.poolAddress)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
              >
                View on explorer ↗
              </a>
            </div>
          );
        })}
      </div>

      {/* Footer warnings */}
      {warnings.length > 0 && (
        <div className="px-5 py-3 border-t border-zinc-100 dark:border-zinc-800 bg-amber-50/50 dark:bg-amber-950/20">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">Warnings (partial data)</p>
          <ul className="mt-1 list-disc pl-4 text-xs text-amber-700 dark:text-amber-400">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
