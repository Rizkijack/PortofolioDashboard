"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChainKey } from "@/lib/types";
import type { TxItem } from "@/lib/tx";

type NextParams = Record<string, string> | Record<string, Record<string, string> | null> | null;

interface UseTxResult {
  data: TxItem[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => void;
}

export function useTx(address?: string, opts?: { chains?: ChainKey[]; limit?: number }): UseTxResult {
  const chains = opts?.chains;
  const limit = opts?.limit ?? 20;

  const chainsKey = chains ? [...chains].sort().join(",") : "";

  const [data, setData] = useState<TxItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<NextParams>(null);
  const [nonce, setNonce] = useState(0);

  // reset on address / chains / limit change — render-time sync pattern
  const prevKeyRef = useRef<string>("");
  const currentKey = `${address ?? ""}|${chainsKey}|${limit}|${nonce}`;
  const [prevKey, setPrevKey] = useState(currentKey);
  if (prevKey !== currentKey) {
    setPrevKey(currentKey);
    setData([]);
    setError(null);
    setHasMore(false);
    setCursor(null);
  }
  // track for effect comparison
  useEffect(() => {
    prevKeyRef.current = currentKey;
  }, [currentKey]);

  const fetchPage = useCallback(
    async (isLoadMore: boolean) => {
      if (!address) throw new Error("no address");
      const ctrlKey = isLoadMore ? cursor : null;
      const qs = new URLSearchParams();
      qs.set("address", address);
      if (chainsKey) qs.set("chains", chainsKey);
      qs.set("limit", String(limit));
      if (isLoadMore && ctrlKey) {
        qs.set("nextPageParams", JSON.stringify(ctrlKey));
      }
      // for initial fetch we do not send nextPageParams

      const res = await fetch(`/api/tx?${qs.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `tx ${res.status}`);
      }
      const json = (await res.json()) as {
        txs: TxItem[];
        nextPageParams: NextParams;
        hasMore: boolean;
      };
      return json;
    },
    [address, limit, cursor, chainsKey]
  );

  // initial load
  useEffect(() => {
    if (!address) {
      return;
    }
    let cancelled = false;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams();
        qs.set("address", address);
        if (chainsKey) qs.set("chains", chainsKey);
        qs.set("limit", String(limit));
        const res = await fetch(`/api/tx?${qs.toString()}`, { cache: "no-store", signal: ctrl.signal });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `tx ${res.status}`);
        }
        const json = (await res.json()) as { txs: TxItem[]; nextPageParams: NextParams; hasMore: boolean };
        if (cancelled) return;
        // dedupe by chainId-hash
        const seen = new Set<string>();
        const deduped: TxItem[] = [];
        for (const t of json.txs) {
          const k = `${t.chainId}-${t.hash.toLowerCase()}`;
          if (!seen.has(k)) {
            seen.add(k);
            deduped.push(t);
          }
        }
        setData(deduped);
        setCursor(json.nextPageParams ?? null);
        setHasMore(!!json.hasMore);
        setError(null);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setError(e instanceof Error ? e.message : "tx fetch failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      ctrl.abort();
    };
  }, [address, chainsKey, limit, nonce]);

  const loadMore = useCallback(async () => {
    if (!address || !hasMore || loading) return;
    setLoading(true);
    setError(null);
    try {
      const json = await fetchPage(true);
      // merge with dedupe
      setData((prev) => {
        const seen = new Set(prev.map((p) => `${p.chainId}-${p.hash.toLowerCase()}`));
        const next: TxItem[] = [...prev];
        for (const t of json.txs) {
          const k = `${t.chainId}-${t.hash.toLowerCase()}`;
          if (!seen.has(k)) {
            seen.add(k);
            next.push(t);
          }
        }
        // sort by timestamp desc
        next.sort((a, b) => {
          const ta = a.timestamp ?? 0;
          const tb = b.timestamp ?? 0;
          if (tb !== ta) return tb - ta;
          return (b.blockNumber ?? 0) - (a.blockNumber ?? 0);
        });
        return next;
      });
      setCursor(json.nextPageParams ?? null);
      setHasMore(!!json.hasMore);
    } catch (e) {
      setError(e instanceof Error ? e.message : "tx fetch failed");
    } finally {
      setLoading(false);
    }
  }, [address, hasMore, loading, fetchPage]);

  const refresh = useCallback(() => {
    setNonce((n) => n + 1);
  }, []);

  return { data, loading, error, hasMore, loadMore, refresh };
}
