"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, ColorType, CandlestickSeries, AreaSeries } from "lightweight-charts";
import type { IChartApi, ISeriesApi } from "lightweight-charts";
import { CHAINS, chainMeta, getChainById } from "@/lib/chains";
import { fmtNumber, fmtUsd } from "@/lib/utils";
import type { PortfolioPosition } from "@/lib/compat";
import type { TokenDetailResponse } from "@/lib/types";

interface TokenDetailModalProps {
  position: PortfolioPosition | null;
  ownerAddress?: string;
  onClose: () => void;
}

export function TokenDetailModal({ position, ownerAddress, onClose }: TokenDetailModalProps) {
  const [tf, setTf] = useState<"1h" | "24h" | "7d">("24h");
  const [chartType, setChartType] = useState<"candle" | "area">("candle");
  const [detail, setDetail] = useState<TokenDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hoveredData, setHoveredData] = useState<{ time: number; value?: number; o?: number; h?: number; l?: number; c?: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  // Fetch token detail whenever position or tf changes
  useEffect(() => {
    if (!position) return;
    let cancelled = false;
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const ownerParam = ownerAddress ? `&owner=${ownerAddress}` : "";
        const res = await fetch(
          `/api/token/${position?.chainKey}/${position?.token.address}?chart=${tf}${ownerParam}`,
          { signal: ctrl.signal }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `Failed to fetch token detail (${res.status})`);
        }
        const json = (await res.json()) as TokenDetailResponse;
        if (cancelled) return;
        setDetail(json);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "Failed to load token detail");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [position, tf, ownerAddress]);

  // Copy address helper
  const copyAddress = useCallback(() => {
    if (!position?.token.address) return;
    navigator.clipboard.writeText(position.token.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [position]);

  // Escape key close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Render Lightweight Charts (TradingView)
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Cleanup previous chart
    if (chartRef.current) {
      try {
        chartRef.current.remove();
      } catch {}
      chartRef.current = null;
      candleSeriesRef.current = null;
      areaSeriesRef.current = null;
    }

    const chartPoints = detail?.chart ?? [];
    if (chartPoints.length === 0) return;

    const isDark = typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? "#18181b" : "#ffffff" },
        textColor: isDark ? "#a1a1aa" : "#71717a",
      },
      grid: {
        vertLines: { color: isDark ? "rgba(63,63,70,0.25)" : "rgba(228,228,231,0.6)" },
        horzLines: { color: isDark ? "rgba(63,63,70,0.25)" : "rgba(228,228,231,0.6)" },
      },
      width: container.clientWidth,
      height: 240,
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      crosshair: {
        vertLine: { color: isDark ? "#52525b" : "#d4d4d8", width: 1, style: 2 },
        horzLine: { color: isDark ? "#52525b" : "#d4d4d8", width: 1, style: 2 },
      },
      handleScroll: { mouseWheel: false, pressedMouseMove: false, horzTouchDrag: false, vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: false, mouseWheel: false, pinch: false },
    });

    chartRef.current = chart;

    if (chartType === "candle") {
      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#10b981",
        downColor: "#ef4444",
        borderUpColor: "#10b981",
        borderDownColor: "#ef4444",
        wickUpColor: "#10b981",
        wickDownColor: "#ef4444",
      });
      candleSeriesRef.current = candleSeries;

      const formatted = chartPoints
        .map((p) => ({
          time: Math.floor(p.t / 1000) as unknown as import("lightweight-charts").Time,
          open: p.o,
          high: p.h,
          low: p.l,
          close: p.c,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      // Dedup time
      const deduped: typeof formatted = [];
      const seen = new Set<number>();
      for (const f of formatted) {
        const k = f.time as number;
        if (!seen.has(k)) {
          seen.add(k);
          deduped.push(f);
        }
      }

      candleSeries.setData(deduped);
      chart.timeScale().fitContent();

      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData) {
          setHoveredData(null);
          return;
        }
        const data = param.seriesData.get(candleSeries) as { open?: number; high?: number; low?: number; close?: number } | undefined;
        if (data) {
          setHoveredData({
            time: (param.time as number) * 1000,
            o: data.open,
            h: data.high,
            l: data.low,
            c: data.close,
          });
        } else {
          setHoveredData(null);
        }
      });
    } else {
      const isUp = (position?.change24h ?? 0) >= 0;
      const areaSeries = chart.addSeries(AreaSeries, {
        lineColor: isUp ? "#10b981" : "#ef4444",
        topColor: isUp ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)",
        bottomColor: isUp ? "rgba(16,185,129,0.02)" : "rgba(239,68,68,0.02)",
        lineWidth: 2,
      });
      areaSeriesRef.current = areaSeries;

      const formatted = chartPoints
        .map((p) => ({
          time: Math.floor(p.t / 1000) as unknown as import("lightweight-charts").Time,
          value: p.c,
        }))
        .sort((a, b) => (a.time as number) - (b.time as number));

      const deduped: typeof formatted = [];
      const seen = new Set<number>();
      for (const f of formatted) {
        const k = f.time as number;
        if (!seen.has(k)) {
          seen.add(k);
          deduped.push(f);
        }
      }

      areaSeries.setData(deduped);
      chart.timeScale().fitContent();

      chart.subscribeCrosshairMove((param) => {
        if (!param.time || !param.seriesData) {
          setHoveredData(null);
          return;
        }
        const data = param.seriesData.get(areaSeries) as { value?: number } | undefined;
        if (data && typeof data.value === "number") {
          setHoveredData({ time: (param.time as number) * 1000, value: data.value });
        } else {
          setHoveredData(null);
        }
      });
    }

    const ro = new ResizeObserver(() => {
      if (!container || !chartRef.current) return;
      chartRef.current.applyOptions({ width: container.clientWidth });
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      try {
        chart.remove();
      } catch {}
      chartRef.current = null;
    };
  }, [detail?.chart, chartType, position?.change24h]);

  if (!position) return null;

  const meta = chainMeta[position.chainId];
  const chain = getChainById(position.chainId);
  const chainConfig = CHAINS[position.chainKey];

  const currentPrice = detail?.token?.price.usd ?? position.priceUsd;
  const userBalance = detail?.token?.balance ?? position.balance;
  const userValueUsd = detail?.token?.valueUsd ?? position.valueUsd;
  const change24h = position.change24h;

  const mcap = detail?.meta.circulatingMarketCap;
  const vol24h = detail?.meta.volume24h;
  const liq = detail?.meta.liquidityUsd;
  const fdv = detail?.meta.fdv;
  const holders = detail?.meta.holdersCount;
  const supply = detail?.meta.totalSupply;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      {/* Modal Container */}
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl p-5 md:p-6 flex flex-col gap-5">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {position.token.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={position.token.logo}
                alt={position.token.symbol}
                className="h-11 w-11 rounded-2xl object-cover border border-zinc-200 dark:border-zinc-800"
              />
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-sm font-bold">
                {position.token.symbol.slice(0, 2)}
              </span>
            )}
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">{position.token.symbol}</h2>
                <span
                  className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                  style={{
                    borderColor: meta?.color ? `${meta.color}40` : undefined,
                    background: meta?.color ? `${meta.color}14` : undefined,
                  }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta?.color ?? "#000" }} />
                  {chain?.name ?? meta?.short}
                </span>
                {position.verified && (
                  <span className="text-xs text-emerald-500 font-bold" title="Verified Token">✓ Verified</span>
                )}
              </div>
              <p className="text-xs text-zinc-500 truncate max-w-[280px] sm:max-w-md">{position.token.name}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            aria-label="Close modal"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Price & Change Banner */}
        <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800 p-4 flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <span className="text-xs uppercase tracking-widest text-zinc-500">Live Price</span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight font-mono">
                {fmtUsd(hoveredData?.value ?? hoveredData?.c ?? currentPrice)}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                  (change24h || 0) >= 0 ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
                }`}
              >
                {(change24h || 0) >= 0 ? "↗ +" : "↘ "}
                {change24h?.toFixed(2) ?? "0.00"}%
              </span>
            </div>
          </div>

          {hoveredData?.o && (
            <div className="text-[11px] font-mono text-zinc-500 flex gap-3">
              <span>O: {fmtUsd(hoveredData.o)}</span>
              <span>H: {fmtUsd(hoveredData.h)}</span>
              <span>L: {fmtUsd(hoveredData.l)}</span>
              <span>C: {fmtUsd(hoveredData.c)}</span>
            </div>
          )}

          {/* User Holding Box */}
          <div className="sm:text-right">
            <span className="text-xs uppercase tracking-widest text-zinc-500">Your Holding</span>
            <p className="text-sm font-mono font-semibold text-zinc-900 dark:text-white">
              {fmtNumber(Number(userBalance), 4)} {position.token.symbol}
            </p>
            <p className="text-xs font-mono text-zinc-500">{fmtUsd(userValueUsd)}</p>
          </div>
        </div>

        {/* Chart Section (TradingView Lightweight Charts) */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">TradingView Chart</span>
              <div className="inline-flex rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-0.5 text-[11px]">
                <button
                  onClick={() => setChartType("candle")}
                  className={`px-2 py-0.5 rounded-full font-medium transition ${
                    chartType === "candle" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow" : "text-zinc-500"
                  }`}
                >
                  Candles
                </button>
                <button
                  onClick={() => setChartType("area")}
                  className={`px-2 py-0.5 rounded-full font-medium transition ${
                    chartType === "area" ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow" : "text-zinc-500"
                  }`}
                >
                  Area
                </button>
              </div>
            </div>

            {/* Timeframe selector */}
            <div className="inline-flex rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 p-0.5 text-[11px]">
              {(["1h", "24h", "7d"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={`px-2.5 py-0.5 rounded-full font-semibold transition ${
                    tf === t ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow" : "text-zinc-500"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="relative rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 overflow-hidden min-h-[240px] flex items-center justify-center">
            {loading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xs">
                <span className="text-xs font-medium text-zinc-500 animate-pulse">Loading market chart…</span>
              </div>
            )}
            {error && (
              <div className="p-6 text-center text-xs text-red-500">
                {error}
              </div>
            )}
            {!loading && (!detail?.chart || detail.chart.length === 0) && (
              <div className="p-8 text-center text-xs text-zinc-500">
                Chart OHLCV tidak tersedia untuk pasangan token ini di DEX pools.
              </div>
            )}
            <div ref={containerRef} className="w-full h-[240px]" />
          </div>
        </div>

        {/* Multi-Source Aggregated Metrics Grid (DexScreener + GeckoTerminal + Birdeye + Explorer) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-zinc-500">
              Aggregated Metrics (DexScreener • GeckoTerminal • Birdeye)
            </h3>
            <span className="text-[10px] text-zinc-400">Multi-source Real-time</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <span className="text-[11px] uppercase tracking-widest text-zinc-500">Market Cap</span>
              <p className="text-sm font-semibold font-mono mt-0.5 text-zinc-900 dark:text-white">
                {mcap ? fmtUsd(mcap, { compact: true }) : "—"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <span className="text-[11px] uppercase tracking-widest text-zinc-500">24h Volume</span>
              <p className="text-sm font-semibold font-mono mt-0.5 text-zinc-900 dark:text-white">
                {vol24h ? fmtUsd(vol24h, { compact: true }) : "—"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <span className="text-[11px] uppercase tracking-widest text-zinc-500">Liquidity / TVL</span>
              <p className="text-sm font-semibold font-mono mt-0.5 text-zinc-900 dark:text-white">
                {liq ? fmtUsd(liq, { compact: true }) : "—"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <span className="text-[11px] uppercase tracking-widest text-zinc-500">FDV</span>
              <p className="text-sm font-semibold font-mono mt-0.5 text-zinc-900 dark:text-white">
                {fdv ? fmtUsd(fdv, { compact: true }) : "—"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <span className="text-[11px] uppercase tracking-widest text-zinc-500">Holders Count</span>
              <p className="text-sm font-semibold font-mono mt-0.5 text-zinc-900 dark:text-white">
                {holders ? holders.toLocaleString("en-US") : "—"}
              </p>
            </div>

            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/50 p-3">
              <span className="text-[11px] uppercase tracking-widest text-zinc-500">Total Supply</span>
              <p className="text-sm font-semibold font-mono mt-0.5 text-zinc-900 dark:text-white truncate" title={supply ?? ""}>
                {supply ? fmtNumber(Number(supply), 2) : "—"}
              </p>
            </div>
          </div>
        </div>

        {/* Contract & External Links Bar */}
        <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[11px] uppercase tracking-widest text-zinc-500">Contract Address</span>
              <p className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">{position.token.address}</p>
            </div>
            <button
              onClick={copyAddress}
              className="shrink-0 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              {copied ? "✓ Copied" : "Copy"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-200 dark:border-zinc-800 text-xs">
            <span className="text-[11px] uppercase tracking-widest text-zinc-400 mr-1">Inspect on:</span>
            
            <a
              href={detail?.meta.explorerUrl ?? `${chainConfig?.explorer}/token/${position.token.address}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              Explorer ↗
            </a>

            <a
              href={detail?.meta.dexscreenerUrl ?? `https://dexscreener.com/${position.chainKey}/${position.token.address}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              DexScreener ↗
            </a>

            <a
              href={detail?.meta.geckoterminalUrl ?? `https://www.geckoterminal.com/${position.chainKey}/tokens/${position.token.address}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              GeckoTerminal ↗
            </a>

            <a
              href={detail?.meta.birdeyeUrl ?? `https://birdeye.so/token/${position.token.address}?chain=${position.chainKey}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-1 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
            >
              Birdeye ↗
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
