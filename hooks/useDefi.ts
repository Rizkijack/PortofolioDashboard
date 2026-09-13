"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChainKey } from "@/lib/types";
import type { DefiPosition } from "@/lib/defi/types";

interface DefiApiResponse {
  address: string;
  addressLower: string;
  positions: DefiPosition[];
  byChain: Record<ChainKey, DefiPosition[]>;
  warnings: string[];
  fetchedAt: number;
  partial: boolean;
}

/**
 * useDefi — client hook untuk /api/defi.
 * - Tanpa address: tidak fetch (data null).
 * - Handle address change anti-leak (render-time sync).
 * - AbortController + nonce refresh.
 */
export function useDefi(
  address?: string,
  opts?: { chains?: ChainKey[] }
) {
  const chains = opts?.chains;

  const [data, setData] = useState<DefiPosition[] | null>(null);
  const [byChain, setByChain] = useState<Record<ChainKey, DefiPosition[]> | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  // anti-leak: reset saat address berganti (render-time sync, pola resmi React)
  const [prevAddress, setPrevAddress] = useState(address);
  if (prevAddress !== address) {
    setPrevAddress(address);
    setData(null);
    setByChain(null);
    setWarnings([]);
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
        const params = new URLSearchParams({ address: address as string });
        if (chains && chains.length) params.set("chains", chains.join(","));
        const res = await fetch(`/api/defi?${params.toString()}`, {
          cache: "no-store",
          signal: ctrl.signal,
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `defi ${res.status}`);
        }
        const json = (await res.json()) as DefiApiResponse;
        if (cancelled) return;
        setData(json.positions ?? []);
        setByChain((json.byChain as Record<ChainKey, DefiPosition[]>) ?? null);
        setWarnings(json.warnings ?? []);
        setError(null);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "defi fetch failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      ctrl.abort();
    };
    // chains di-serialize jadi string untuk dependency yang stabil
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, nonce, chains?.join(",")]);

  return { data, byChain, warnings, loading, error, refresh };
}
