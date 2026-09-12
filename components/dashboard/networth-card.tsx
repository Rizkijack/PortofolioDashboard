"use client";

import { fmtUsd } from "@/lib/utils";

export function NetworthCard({
  totalUsd,
  changeUsd,
  changePct,
  updatedAt,
}: {
  totalUsd: number;
  changeUsd: number;
  changePct: number;
  updatedAt?: number;
}) {
  const isUp = changePct >= 0;
  return (
    <div className="rounded-[24px] bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 p-7 md:p-8 flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] opacity-60">Total Net Worth</p>
          <p className="mt-2 text-4xl md:text-5xl font-bold tracking-tighter leading-none">
            {fmtUsd(totalUsd)}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${isUp ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
              {isUp ? "↗" : "↘"} {isUp ? "+" : ""}{fmtUsd(changeUsd)} • {changePct.toFixed(2)}%
            </span>
            <span className="text-xs opacity-60">24h</span>
          </div>
        </div>
        <div className="hidden md:flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 dark:bg-zinc-900/10 text-xl">
          ◈
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs opacity-60">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        Live • {updatedAt ? new Date(updatedAt).toLocaleTimeString() : "—"} • 5 chains
      </div>
    </div>
  );
}
