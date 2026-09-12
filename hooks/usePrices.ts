"use client";

import { useEffect, useState } from "react";
import { getUniqueCoingeckoIds } from "@/lib/tokens";
import { PRICE_POLL_MS, type PriceMap } from "@/lib/prices";

export function usePrices(pollMs = PRICE_POLL_MS) {
  const [prices, setPrices] = useState<PriceMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval>;

    async function load() {
      try {
        const ids = getUniqueCoingeckoIds();
        const res = await globalThis.fetch(`/api/prices?ids=${ids.join(",")}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`prices ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setPrices(json.data);
        setUpdatedAt(Date.now());
        setError(null);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "price fetch failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    timer = setInterval(load, pollMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pollMs]);

  return { prices, loading, error, updatedAt };
}
