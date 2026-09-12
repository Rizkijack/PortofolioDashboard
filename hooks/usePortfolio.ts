"use client";

import { useEffect, useState } from "react";
import type { PortfolioSummary } from "@/lib/portfolio";
import type { PriceMap } from "@/lib/prices";

export function usePortfolio(address?: string, prices?: PriceMap) {
  const [data, setData] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        if (address) qs.set("address", address);
        // prices are injected for mock calc; real API will fetch internally
        const res = await fetch(`/api/portfolio?${qs.toString()}`, { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && json.success) {
          // if prices available client-side, recalc valueUsd for real-time
          if (prices && json.data?.positions) {
            const positions = json.data.positions.map((p: any) => {
              const priceUsd = prices[p.token.coingeckoId || ""]?.usd ?? p.priceUsd;
              return { ...p, priceUsd, valueUsd: p.formatted * priceUsd };
            });
            const totalUsd = positions.reduce((a: number, p: any) => a + p.valueUsd, 0);
            setData({ ...json.data, positions, totalUsd, updatedAt: Date.now() });
          } else {
            setData(json.data);
          }
        }
      } catch {}
      if (!cancelled) setLoading(false);
    }
    load();
    const t = setInterval(load, 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [address, prices]);

  return { data, loading };
}
