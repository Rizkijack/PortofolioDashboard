"use client";

import { useCallback, useEffect, useState } from "react";
import type { HistoryPoint, HistoryRange, HistoryResponse } from "@/lib/history";

export type UseHistoryReturn = {
  data: HistoryPoint[] | null;
  raw: HistoryResponse | null;
  loading: boolean;
  error: string | null;
  range: HistoryRange;
  setRange: (r: HistoryRange) => void;
  refresh: () => void;
  limited: boolean;
};

export function useHistory(address?: string, initialRange: HistoryRange = "7d"): UseHistoryReturn {
  const [range, setRange] = useState<HistoryRange>(initialRange);
  const [raw, setRaw] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // sync if caller controls range via prop
  const [prevInitial, setPrevInitial] = useState(initialRange);
  if (prevInitial !== initialRange) {
    setPrevInitial(initialRange);
    setRange(initialRange);
  }

  // reset when address changes (avoid stale wallet leak)
  const [prevAddress, setPrevAddress] = useState(address);
  if (prevAddress !== address) {
    setPrevAddress(address);
    setRaw(null);
    setError(null);
    setLoading(false);
  }

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    const ctrl = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/history?address=${address}&range=${encodeURIComponent(range)}`,
          { cache: "no-store", signal: ctrl.signal }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `history ${res.status}`);
        }
        const json = (await res.json()) as HistoryResponse;
        if (cancelled) return;
        setRaw(json);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "history fetch failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [address, range, nonce]);

  return {
    data: raw?.points ?? null,
    raw,
    loading,
    error,
    range,
    setRange,
    refresh,
    limited: raw?.limited ?? false,
  };
}
