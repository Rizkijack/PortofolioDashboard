"use client";

import { useEffect, useState } from "react";
import type { PriceMap } from "@/lib/prices";
import { PRICE_POLL_MS } from "@/lib/prices";

/**
 * Ticker harga untuk aset mayor dalam daftar kurasi.
 *
 * Sumber sebenarnya ditentukan server (Binance stream → RedStone API).
 * Kalau sebuah aset tidak punya harga, nilainya `null` — UI menampilkannya "—".
 */
export function usePrices(pollMs = PRICE_POLL_MS) {
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();

    async function load(showSpinner: boolean) {
      try {
        const ids = ["ethereum", "bitcoin", "binancecoin", "hyperliquid", "solana", "chainlink"];
        const res = await fetch(`/api/prices?ids=${ids.join(",")}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(`prices ${res.status}`);
        const json = (await res.json()) as { quotes?: PriceMap; data?: PriceMap };
        if (cancelled) return;
        setPrices(json.quotes ?? json.data ?? {});
        setUpdatedAt(Date.now());
        setError(null);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "price fetch failed");
      } finally {
        if (!cancelled && showSpinner) setLoading(false);
      }
    }

    load(true);
    const t = setInterval(() => load(false), pollMs);
    return () => {
      cancelled = true;
      clearInterval(t);
      ctrl.abort();
    };
  }, [pollMs]);

  return { prices, loading, error, updatedAt };
}
