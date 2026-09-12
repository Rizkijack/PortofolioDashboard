"use client";

import { fmtNumber, fmtUsd } from "@/lib/utils";
import { chainMeta, getChainById } from "@/lib/chains";
import type { PortfolioPosition } from "@/lib/compat";

export function AssetsTable({
  positions,
  filterChain,
}: {
  positions: PortfolioPosition[];
  filterChain?: number | null;
}) {
  const filtered = filterChain ? positions.filter((p) => p.chainId === filterChain) : positions;
  if (!filtered.length) {
    return <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center text-sm text-zinc-500">No assets for this filter.</div>;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
            <tr className="text-left text-xs uppercase tracking-widest text-zinc-500">
              <th className="px-4 py-3 font-medium">Asset</th>
              <th className="px-4 py-3 font-medium">Chain</th>
              <th className="px-4 py-3 font-medium text-right">Balance</th>
              <th className="px-4 py-3 font-medium text-right">Price</th>
              <th className="px-4 py-3 font-medium text-right">Value</th>
              <th className="px-4 py-3 font-medium text-right">24h</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.map((p, i) => {
              const meta = chainMeta[p.chainId];
              const chain = getChainById(p.chainId);
              return (
                <tr key={`${p.chainId}-${p.token.address}-${i}`} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/50">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-bold">
                        {p.token.symbol.slice(0, 2)}
                      </span>
                      <div>
                        <p className="font-semibold leading-none">{p.token.symbol}</p>
                        <p className="text-xs text-zinc-500">{p.token.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 px-2.5 py-1 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: meta?.color || "#000" }} />
                      {chain?.name || meta?.short}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right font-mono">{fmtNumber(p.formatted, 4)}</td>
                  <td className="px-4 py-4 text-right font-mono">{fmtUsd(p.priceUsd)}</td>
                  <td className="px-4 py-4 text-right font-semibold">{fmtUsd(p.valueUsd)}</td>
                  <td className={`px-4 py-4 text-right text-xs font-medium ${ (p.change24h||0) >=0 ? "text-emerald-600" : "text-red-600"}`}>
                    {(p.change24h||0) >=0 ? "+" : ""}{(p.change24h||0).toFixed(2)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
