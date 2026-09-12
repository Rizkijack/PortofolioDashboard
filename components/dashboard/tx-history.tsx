"use client";

import { useTx } from "@/hooks/useTx";
import { CHAINS } from "@/lib/chains";
import type { ChainKey } from "@/lib/types";
import type { TxItem } from "@/lib/tx";

function shortHash(h: string) {
  if (h.length <= 12) return h;
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

function shortAddr(a: string) {
  if (!a) return "—";
  if (a.length <= 12) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatTime(ts: number | null) {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "now";
  if (diff < 3600_000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function StatusDot({ status }: { status: TxItem["status"] }) {
  const color =
    status === "ok" ? "bg-emerald-500" : status === "failed" ? "bg-red-500" : "bg-amber-400";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} title={status} />;
}

export function TxHistory({ address, chains }: { address?: string; chains?: ChainKey[] }) {
  const { data, loading, error, hasMore, loadMore, refresh } = useTx(address, { chains, limit: 20 });

  if (!address) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-8 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
            ◈
          </div>
          <p className="text-sm font-semibold">Connect wallet untuk melihat transaksi</p>
          <p className="text-xs text-zinc-500">
            Hubungkan wallet untuk menampilkan riwayat transaksi on-chain per chain (Base, BSC, Ink, HyperEVM, Robinhood).
          </p>
        </div>
      </div>
    );
  }

  if (loading && data.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-10 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-10 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-10 rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-10 rounded bg-zinc-100 dark:bg-zinc-800" />
        </div>
      </div>
    );
  }

  if (error && data.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-red-600">Gagal memuat transaksi: {error}</p>
          <button
            onClick={refresh}
            className="rounded-full border border-zinc-200 dark:border-zinc-700 px-3 py-1 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!loading && data.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center">
        <p className="text-sm font-semibold">Belum ada transaksi</p>
        <p className="text-xs text-zinc-500 mt-1">Alamat ini belum memiliki riwayat transaksi pada chain terpilih.</p>
        <button
          onClick={refresh}
          className="mt-4 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-4 py-1.5 text-xs font-semibold"
        >
          Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 px-4 py-3">
        <h3 className="text-sm font-bold uppercase tracking-widest">Transaction History</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">{data.length} txs</span>
          <button
            onClick={refresh}
            className="rounded-full border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Mobile cards / Desktop table */}
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {/* Header row desktop */}
        <div className="hidden md:grid grid-cols-[1fr_110px_120px_100px_90px] gap-2 px-4 py-2 text-[11px] uppercase tracking-widest text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50">
          <span>Tx • Method</span>
          <span>Chain</span>
          <span className="text-right">Value</span>
          <span className="text-right">Time</span>
          <span className="text-center">Explorer</span>
        </div>

        {data.map((tx) => {
          const meta = CHAINS[tx.chain];
          const explorerTx = `${meta.explorer}/tx/${tx.hash}`;
          const displayValue = (() => {
            // formattedValue is decimal string; add symbol
            const v = tx.formattedValue;
            // avoid showing 0 for token transfers? show native value + hint if tokenTransfers
            if (v === "0" && tx.tokenTransfers && tx.tokenTransfers.length) {
              const tt = tx.tokenTransfers[0];
              return `${tt.value ? `${tt.value.slice(0, 6)}…` : "→"} ${tt.symbol}`;
            }
            return `${v} ${meta.nativeSymbol}`;
          })();

          return (
            <div
              key={`${tx.chain}-${tx.hash}`}
              className="grid grid-cols-1 md:grid-cols-[1fr_110px_120px_100px_90px] gap-2 px-4 py-3 text-sm hover:bg-zinc-50/60 dark:hover:bg-zinc-800/50"
            >
              <div className="flex items-start gap-2.5 min-w-0">
                <span className="mt-1.5">
                  <StatusDot status={tx.status} />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <a
                      href={explorerTx}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-xs font-semibold hover:underline"
                      title={tx.hash}
                    >
                      {shortHash(tx.hash)}
                    </a>
                    {tx.method ? (
                      <span className="inline-flex rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                        {tx.method}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-full border border-zinc-200 dark:border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-widest text-zinc-500">
                        transfer
                      </span>
                    )}
                    <span className={`h-2 w-2 rounded-full ${tx.status === "failed" ? "bg-red-500" : "bg-emerald-500"}`} hidden />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-zinc-500">
                    <span className="font-mono">{shortAddr(tx.from)}</span>
                    <span>→</span>
                    <span className="font-mono">{tx.to ? shortAddr(tx.to) : "—"}</span>
                    {tx.blockNumber ? (
                      <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px]">#{tx.blockNumber}</span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="flex md:block items-center justify-between">
                <span className="md:hidden text-[11px] uppercase tracking-widest text-zinc-500">Chain</span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-xs">
                  <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
                  {meta.shortName}
                </span>
              </div>

              <div className="flex md:block items-center justify-between md:text-right">
                <span className="md:hidden text-[11px] uppercase tracking-widest text-zinc-500">Value</span>
                <span className="font-mono text-xs font-medium truncate" title={displayValue}>
                  {displayValue}
                </span>
                {tx.tokenTransfers && tx.tokenTransfers.length > 1 ? (
                  <span className="ml-1 rounded bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 text-[10px]">+{tx.tokenTransfers.length - 1}</span>
                ) : null}
              </div>

              <div className="flex md:block items-center justify-between md:text-right text-xs text-zinc-500">
                <span className="md:hidden text-[11px] uppercase tracking-widest text-zinc-500">Time</span>
                <span title={tx.timestamp ? new Date(tx.timestamp).toISOString() : ""}>{formatTime(tx.timestamp)}</span>
              </div>

              <div className="flex md:justify-center items-center">
                <a
                  href={explorerTx}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-xs hover:bg-zinc-900 hover:text-white dark:hover:bg-white dark:hover:text-zinc-900 transition"
                >
                  View ↗
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore ? (
        <div className="border-t border-zinc-100 dark:border-zinc-800 p-4 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-5 py-2 text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-300">
          Partial error: {error}
        </div>
      ) : null}
    </div>
  );
}
