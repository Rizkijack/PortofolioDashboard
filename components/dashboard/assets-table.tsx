"use client";

import { fmtNumber, fmtUsd } from "@/lib/utils";
import { chainMeta, getChainById, CHAINS } from "@/lib/chains";
import type { PortfolioPosition } from "@/lib/compat";
import { filterAndSortPositions, type FilterState } from "@/lib/filter";

/**
 * Logo berasal dari explorer third-party (untrusted): hanya URL https absolut
 * yang boleh dirender. Tolak data:, javascript:, http:, dan whitespace.
 */
export function isSafeLogo(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim().toLowerCase();
  return u.startsWith("https://");
}

export function AssetsTable({
  positions,
  filterChain,
  search,
  hideDust,
  hideSuspicious,
  hideUnpriced,
  sortBy,
  dustThreshold,
}: {
  positions: PortfolioPosition[];
  filterChain?: number | null;
  search?: string;
  hideDust?: boolean;
  hideSuspicious?: boolean;
  hideUnpriced?: boolean;
  sortBy?: FilterState["sortBy"];
  dustThreshold?: number;
}) {
  const chainFiltered = filterChain ? positions.filter((p) => p.chainId === filterChain) : positions;
  const hasFilterProp =
    search !== undefined ||
    hideDust !== undefined ||
    hideSuspicious !== undefined ||
    hideUnpriced !== undefined ||
    sortBy !== undefined ||
    dustThreshold !== undefined;
  const filtered = hasFilterProp
    ? filterAndSortPositions(chainFiltered, {
        search: search ?? "",
        hideDust: hideDust ?? false,
        hideSuspicious: hideSuspicious ?? false,
        hideUnpriced: hideUnpriced ?? false,
        sortBy: sortBy ?? "valueDesc",
        dustThreshold: dustThreshold ?? 1,
      })
    : chainFiltered;
  if (!filtered.length) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-10 text-center text-sm text-zinc-500">
        No assets for this filter.
      </div>
    );
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
              <th className="px-4 py-3 font-medium text-center">Discovery / Explorer</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.map((p, i) => {
              const meta = chainMeta[p.chainId];
              const chain = getChainById(p.chainId);
              const explorerBase = CHAINS[p.chainKey]?.explorer || "";
              const explorerTokenUrl = p.isNative
                ? `${explorerBase}`
                : `${explorerBase}/token/${p.token.address}`;
              // logo tidak dipercaya — hanya https yang dirender, selain itu fallback letter avatar
              const logoUrl = p.token.logo && isSafeLogo(p.token.logo) ? p.token.logo.trim() : null;

              return (
                <tr key={`${p.chainId}-${p.token.address}-${i}`} className="hover:bg-zinc-50/60 dark:hover:bg-zinc-800/50">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={logoUrl}
                          alt={p.token.symbol}
                          className="h-8 w-8 rounded-xl object-cover border border-zinc-200 dark:border-zinc-800"
                        />
                      ) : (
                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-bold">
                          {p.token.symbol.slice(0, 2)}
                        </span>
                      )}
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-semibold leading-none">{p.token.symbol}</p>
                          {p.verified && (
                            <span className="text-[10px] text-emerald-500" title="Verified Token">
                              ✓
                            </span>
                          )}
                        </div>
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
                  <td className={`px-4 py-4 text-right text-xs font-medium ${(p.change24h || 0) >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {(p.change24h || 0) >= 0 ? "+" : ""}{(p.change24h || 0).toFixed(2)}%
                  </td>
                  <td className="px-4 py-4 text-center">
                    <div className="inline-flex items-center gap-1.5">
                      {p.discoverySource && (
                        <span className="rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] uppercase font-mono text-zinc-600 dark:text-zinc-400">
                          {p.discoverySource}
                        </span>
                      )}
                      {explorerTokenUrl && (
                        <a
                          href={explorerTokenUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition"
                          title="View on Explorer"
                        >
                          ↗
                        </a>
                      )}
                    </div>
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
