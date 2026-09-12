"use client";

import { usePrices } from "@/hooks/usePrices";
import { fmtUsd } from "@/lib/utils";

export function PriceTicker() {
  const { prices, updatedAt } = usePrices();
  const items = Object.entries(prices).slice(0, 6);
  if (!items.length) return null;
  return (
    <div className="flex items-center gap-3 overflow-x-auto rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2 text-xs">
      <span className="shrink-0 flex items-center gap-1.5 font-semibold uppercase tracking-widest text-zinc-500">
        <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
        Oracle Live
      </span>
      <span className="h-4 w-px bg-zinc-200 dark:bg-zinc-800 shrink-0" />
      <div className="flex items-center gap-4">
        {items.map(([id, v]) => (
          <span key={id} className="shrink-0 flex items-center gap-1.5">
            <span className="font-semibold uppercase">{id.slice(0, 4)}</span>
            <span className="font-mono">{fmtUsd(v.usd)}</span>
            {typeof v.change24h === "number" && (
              <span className={v.change24h >= 0 ? "text-emerald-600" : "text-red-600"}>
                {v.change24h >= 0 ? "+" : ""}{v.change24h.toFixed(2)}%
              </span>
            )}
          </span>
        ))}
      </div>
      <span className="ml-auto hidden md:inline text-zinc-500 shrink-0">
        {updatedAt ? new Date(updatedAt).toLocaleTimeString() : ""}
      </span>
    </div>
  );
}
