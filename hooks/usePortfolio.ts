"use client";

import { useEffect, useState } from "react";
import type { PortfolioResponse } from "@/lib/types";
import { summarize, type PortfolioSummary } from "@/lib/compat";

/**
 * Ambil portofolio NYATA dari /api/portfolio.
 *
 * - Tanpa `address`: tidak memanggil API (tidak ada data contoh).
 * - `preferStream`: kalau true, pakai SSE /api/stream supaya update
 *   portofolio + harga datang push dari server (bukan polling).
 */
export function usePortfolio(address?: string, preferStream = true) {
  const [raw, setRaw] = useState<PortfolioResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streamLive, setStreamLive] = useState(false);
  const [nonce, setNonce] = useState(0);

  // Sinkronisasi saat address berganti — pola render-time sync resmi React
  // (bukan setState di dalam effect) supaya data wallet lama tidak bocor.
  const [prevAddress, setPrevAddress] = useState(address);
  if (prevAddress !== address) {
    setPrevAddress(address);
    setRaw(null);
    setError(null);
    setLoading(false);
    setStreamLive(false);
  }

  // Snapshot awal (SSE tidak mengirim seluruh detail token, hanya ringkasan).
  useEffect(() => {
    if (!address) return;

    let cancelled = false;
    const ctrl = new AbortController();

    async function load(showSpinner: boolean) {
      if (showSpinner) setLoading(true);
      try {
        const res = await fetch(`/api/portfolio?address=${address}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `portfolio ${res.status}`);
        }
        const json = (await res.json()) as PortfolioResponse;
        if (cancelled) return;
        setRaw(json);
        setError(null);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "portfolio fetch failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load(true);
    // refresh penuh tiap 20s sebagai jaring pengaman; SSE yang menangani realtime
    const t = setInterval(() => load(false), 20_000);
    return () => {
      cancelled = true;
      clearInterval(t);
      ctrl.abort();
    };
  }, [address, nonce]);

  // SSE: perbarui total nilai + harga saat server push delta.
  // streamLive internal hanya dari callback EventSource; nilai yang
  // diekspos di-AND dengan address+preferStream supaya tidak basi.
  useEffect(() => {
    if (!address || !preferStream) return;
    const es = new EventSource(`/api/stream?address=${address}&interval=5000`);

    es.addEventListener("hello", () => setStreamLive(true));
    es.addEventListener("error", () => {
      setStreamLive(false);
    });
    es.addEventListener("portfolio", (ev) => {
      try {
        const d = JSON.parse((ev as MessageEvent).data) as {
          totalValueUsd: number | null;
          changedAt: number;
        };
        setRaw((prev) => (prev ? { ...prev, totalValueUsd: d.totalValueUsd, fetchedAt: d.changedAt } : prev));
      } catch {
        /* abaikan payload rusak */
      }
    });
    es.addEventListener("prices", (ev) => {
      try {
        const d = JSON.parse((ev as MessageEvent).data) as {
          quotes: Record<string, { usd: number | null; source: string; updatedAt: number }>;
        };
        setRaw((prev) => {
          if (!prev) return prev;
          // M28 fix: recompute totalValueUsd & allocation dari token terpatch, bukan hanya patch baris
          const nextChains = prev.chains.map((c) => ({
            ...c,
            tokens: c.tokens.map((t) => {
              const q = d.quotes[`${c.chain}:${t.addressLower}`];
              if (!q) return t;
              const valueUsd = q.usd === null ? null : Number(t.balance) * q.usd;
              return {
                ...t,
                valueUsd: valueUsd !== null && Number.isFinite(valueUsd) ? valueUsd : null,
                price: {
                  ...t.price,
                  usd: q.usd,
                  source: q.source as typeof t.price.source,
                  updatedAt: q.updatedAt,
                  fetchedAt: Date.now(),
                  ageMs: Date.now() - q.updatedAt,
                },
              };
            }),
          }));
          // hitung ulang total & allocation dari nextChains
          const grandTotal = nextChains
            .flatMap((c) => c.tokens)
            .filter((t) => t.valueUsd !== null)
            .reduce((s, t) => s + (t.valueUsd as number), 0);
          const anyPriced = nextChains.some((c) => c.tokens.some((t) => t.valueUsd !== null));
          const newTotal = grandTotal > 0 ? grandTotal : anyPriced ? 0 : null;
          // update per-chain totalValueUsd juga (untuk ChainGrid)
          const patchedChains = nextChains.map((c) => {
            const chainTotal = c.tokens.filter((t) => t.valueUsd !== null).reduce((s, t) => s + (t.valueUsd as number), 0);
            const hasPriced = c.tokens.some((t) => t.valueUsd !== null);
            return { ...c, totalValueUsd: hasPriced ? chainTotal : c.tokens.length === 0 ? 0 : c.totalValueUsd };
          });
          return {
            ...prev,
            fetchedAt: Date.now(),
            totalValueUsd: newTotal,
            chains: patchedChains,
          };
        });
      } catch {
        /* abaikan */
      }
    });

    return () => es.close();
  }, [address, preferStream]);

  const summary: PortfolioSummary | null = raw ? summarize(raw) : null;

  return {
    data: summary,
    raw,
    loading,
    error,
    streamLive: streamLive && !!address && preferStream,
    refresh: () => setNonce((n) => n + 1),
  };
}
