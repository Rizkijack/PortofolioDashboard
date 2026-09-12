"use client";

import { supportedChains, chainMeta } from "@/lib/chains";
import { fmtUsd } from "@/lib/utils";

export function ChainGrid({
  byChain,
  onSelect,
  selected,
}: {
  byChain: Record<number, { usd: number; count: number }>;
  onSelect?: (id: number | null) => void;
  selected?: number | null;
}) {
  // Skala bar relatif terhadap chain terbesar — sebelumnya hardcoded 8000.
  const maxUsd = Math.max(...supportedChains.map((c) => byChain[c.id]?.usd ?? 0), 0);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {supportedChains.map((c) => {
        const meta = chainMeta[c.id];
        const data = byChain[c.id];
        const active = selected === c.id;
        const pct = maxUsd > 0 && data ? Math.min(100, (data.usd / maxUsd) * 100) : 0;
        return (
          <button
            key={c.id}
            onClick={() => onSelect?.(active ? null : c.id)}
            className={`text-left rounded-2xl border p-4 transition flex flex-col gap-3 ${
              active ? "bg-zinc-900 text-white border-zinc-900 dark:bg-white dark:text-zinc-900" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 hover:border-zinc-300"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold" style={{ background: meta.color, color: "#fff" }}>
                {meta.icon}
              </span>
              <span className={`text-[11px] uppercase tracking-widest ${active ? "opacity-60" : "text-zinc-500"}`}>{meta.short} • {c.id}</span>
            </div>
            <div>
              <p className="text-xs uppercase tracking-widest opacity-60">{c.name}</p>
              <p className="text-lg font-semibold tracking-tight">{data ? fmtUsd(data.usd) : "—"}</p>
              <p className={`text-xs ${active ? "opacity-60" : "text-zinc-500"}`}>{data ? `${data.count} assets` : "no data"}</p>
            </div>
            <div className={`h-1 rounded-full ${active ? "bg-white/20" : "bg-zinc-100 dark:bg-zinc-800"}`}>
              <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: active ? "#fff" : meta.color }} />
            </div>
          </button>
        );
      })}
    </div>
  );
}
