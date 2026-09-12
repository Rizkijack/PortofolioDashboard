"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, AreaSeries } from "lightweight-charts";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { useHistory } from "@/hooks/useHistory";
import type { HistoryRange } from "@/lib/history";
import { fmtUsd } from "@/lib/utils";

export function HistoryChart({ address }: { address?: string }) {
  const { data, raw, loading, error, range, setRange, limited } = useHistory(address, "7d");
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Area"> | null>(null);
  const [tooltip, setTooltip] = useState<{ value: number; time: number } | null>(null);

  // derived change
  const current = raw?.currentValue ?? data?.[data.length - 1]?.value ?? null;
  const prev = data && data.length >= 2 ? data[data.length - 2]?.value : null;
  const change = current !== null && prev !== null && prev !== 0 ? current - prev : null;
  const changePct = change !== null && prev ? (change / prev) * 100 : null;
  const isUp = (change ?? 0) >= 0;

  // chart creation + resize
  useEffect(() => {
    if (!containerRef.current) return;
    if (!data || data.length === 0) return;
    if (loading) return;

    const container = containerRef.current;

    // cleanup previous
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch {}
      chartRef.current = null;
      seriesRef.current = null;
    }

    const isDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? "#18181b" : "#ffffff" },
        textColor: isDark ? "#a1a1aa" : "#71717a",
      },
      grid: {
        vertLines: { color: isDark ? "rgba(63,63,70,0.3)" : "rgba(228,228,231,0.6)" },
        horzLines: { color: isDark ? "rgba(63,63,70,0.3)" : "rgba(228,228,231,0.6)" },
      },
      width: container.clientWidth,
      height: 220,
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.15, bottom: 0.05 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        vertLine: { color: isDark ? "#52525b" : "#d4d4d8", width: 1, style: 2, labelBackgroundColor: isDark ? "#27272a" : "#fafafa" },
        horzLine: { color: isDark ? "#52525b" : "#d4d4d8", labelBackgroundColor: isDark ? "#27272a" : "#fafafa" },
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false },
    });

    chartRef.current = chart;

    const areaSeries = chart.addSeries(AreaSeries, {
      lineColor: isUp ? "#10b981" : "#ef4444",
      topColor: isUp ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)",
      bottomColor: isUp ? "rgba(16,185,129,0.02)" : "rgba(239,68,68,0.02)",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
    });
    seriesRef.current = areaSeries;

    // Convert ms -> seconds UTCTimestamp
    const chartData = data
      .map((p) => ({
        time: Math.floor(p.t / 1000) as unknown as import("lightweight-charts").Time,
        value: Number.isFinite(p.value) ? p.value : 0,
      }))
      // lightweight-charts requires sorted asc and deduped time
      .sort((a, b) => (a.time as number) - (b.time as number));

    // Dedup identical timestamps: keep last
    const deduped: typeof chartData = [];
    const seen = new Map<number, number>();
    for (const d of chartData) {
      const key = d.time as number;
      seen.set(key, d.value);
    }
    for (const [k, v] of [...seen.entries()].sort((a, b) => a[0] - b[0])) {
      deduped.push({ time: k as unknown as import("lightweight-charts").Time, value: v });
    }

    if (deduped.length >= 1) {
      areaSeries.setData(deduped);
      chart.timeScale().fitContent();
    }

    // tooltip via crosshair move
    const onCrosshairMove = (param: { time?: unknown; seriesData?: Map<unknown, unknown> }) => {
      if (!param.time || !param.seriesData) {
        setTooltip(null);
        return;
      }
      const sd = param.seriesData.get(areaSeries) as { value?: number } | undefined;
      if (sd && typeof sd.value === "number") {
        const timeSec = param.time as number;
        // find original ms closest
        const closest = data.reduce((acc, cur) => {
          const curSec = Math.floor(cur.t / 1000);
          const accDiff = Math.abs((acc ? Math.floor(acc.t / 1000) : Infinity) - timeSec);
          const curDiff = Math.abs(curSec - timeSec);
          return curDiff < accDiff ? cur : acc;
        }, data[0] as (typeof data)[number] | undefined);
        setTooltip({ value: sd.value, time: closest ? closest.t : timeSec * 1000 });
      } else {
        setTooltip(null);
      }
    };

    // lightweight-charts v5: subscribeCrosshairMove
    chart.subscribeCrosshairMove(onCrosshairMove as never);

    const ro = new ResizeObserver(() => {
      if (!container || !chartRef.current) return;
      chartRef.current.applyOptions({ width: container.clientWidth });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(onCrosshairMove as never);
      try {
        chart.remove();
      } catch {}
      chartRef.current = null;
      seriesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isUp]);

  // Also update line color when change flips without full rebuild? handled by effect dep.

  if (!address) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 flex flex-col gap-3 min-h-[280px] justify-center">
        <h3 className="text-sm font-bold uppercase tracking-widest">Net worth history</h3>
        <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 border border-dashed border-zinc-200 dark:border-zinc-700 p-8 flex flex-col items-center justify-center gap-2 text-sm text-zinc-500">
          <span className="text-2xl">◈</span>
          <p className="font-medium">Connect wallet untuk melihat history</p>
          <p className="text-xs text-zinc-400 text-center max-w-[260px]">Historical networth 7d/30d akan tampil setelah wallet terhubung.</p>
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="h-4 w-32 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
          <div className="h-7 w-24 bg-zinc-100 dark:bg-zinc-800 rounded-full animate-pulse" />
        </div>
        <div className="h-[220px] w-full bg-zinc-50 dark:bg-zinc-800 rounded-xl animate-pulse" />
        <div className="flex gap-2">
          <div className="h-6 w-12 bg-zinc-100 dark:bg-zinc-800 rounded-full animate-pulse" />
          <div className="h-6 w-12 bg-zinc-100 dark:bg-zinc-800 rounded-full animate-pulse" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest">Net worth history</h3>
          <RangeSelector range={range} setRange={setRange} />
        </div>
        <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 p-4 text-sm text-red-700 dark:text-red-300">
          Gagal memuat history: {error}
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-widest">Net worth history</h3>
          <RangeSelector range={range} setRange={setRange} />
        </div>
        <div className="h-[220px] flex items-center justify-center text-sm text-zinc-500">No history data</div>
      </div>
    );
  }

  const allFlat = data.length >= 2 && data.every((p) => Math.abs(p.value - data[0].value) < 0.01);

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest">Net worth history</h3>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight">{fmtUsd(current)}</span>
            {change !== null && changePct !== null && data.length >= 2 && (
              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${isUp ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
                {isUp ? "↗" : "↘"} {isUp ? "+" : ""}{fmtUsd(change)} • {isUp ? "+" : ""}{changePct.toFixed(2)}%
              </span>
            )}
            <span className="text-xs text-zinc-500">{range}</span>
          </div>
          {tooltip && (
            <p className="mt-1 text-xs text-zinc-500">
              {new Date(tooltip.time).toLocaleDateString()} • {fmtUsd(tooltip.value)}
            </p>
          )}
        </div>
        <RangeSelector range={range} setRange={setRange} />
      </div>

      {/* Chart */}
      <div className="relative">
        <div ref={containerRef} className="w-full h-[220px] rounded-xl overflow-hidden bg-zinc-50 dark:bg-zinc-900" />
        {/* Edge labels overlay minimal */}
        <div className="pointer-events-none absolute bottom-1 left-2 text-[10px] text-zinc-400">
          {data.length ? new Date(data[0].t).toLocaleDateString() : ""}
        </div>
        <div className="pointer-events-none absolute bottom-1 right-2 text-[10px] text-zinc-400">
          {data.length ? new Date(data[data.length - 1].t).toLocaleDateString() : ""}
        </div>
      </div>

      {/* Footer warnings */}
      {(limited || allFlat) && (
        <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">
          Historical data limited — menampilkan {allFlat ? "flat line (harga saat ini)" : "estimasi"} untuk {range}. Portfolio on-chain tetap akurat.
        </p>
      )}
      {!limited && !allFlat && (
        <p className="text-[11px] text-zinc-500">
          Aggregasi daily • {data.length} points • 5 chains • sumber: CoinGecko{limited ? "" : " + DefiLlama fallback"}
        </p>
      )}
    </div>
  );
}

function RangeSelector({ range, setRange }: { range: HistoryRange; setRange: (r: HistoryRange) => void }) {
  const opts: HistoryRange[] = ["7d", "30d", "90d"];
  // spec primary 7d/30d, 90d optional
  return (
    <div className="inline-flex rounded-full border border-zinc-200 dark:border-zinc-800 p-0.5 bg-zinc-50 dark:bg-zinc-800">
      {opts.map((r) => {
        const active = r === range;
        return (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full transition-colors ${
              active ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow" : "text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            }`}
            aria-pressed={active}
          >
            {r}
          </button>
        );
      })}
    </div>
  );
}
