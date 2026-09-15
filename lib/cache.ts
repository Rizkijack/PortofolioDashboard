/**
 * lib/cache.ts — cache in-memory + stale-while-revalidate + fetch berbatas waktu.
 */

interface Entry<T> {
  value: T;
  storedAt: number;
  expiresAt: number;
}

export interface CacheOptions {
  freshMs: number;
  staleMs?: number;
}

export class TtlCache {
  private map = new Map<string, Entry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();
  private maxEntries: number;

  constructor(maxEntries = 800) {
    this.maxEntries = maxEntries;
  }

  private evict() {
    if (this.map.size <= this.maxEntries) return;
    const sorted = [...this.map.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
    for (const [k] of sorted.slice(0, this.map.size - this.maxEntries)) this.map.delete(k);
  }

  get<T>(key: string): Entry<T> | undefined {
    return this.map.get(key) as Entry<T> | undefined;
  }

  set<T>(key: string, value: T, opts: CacheOptions) {
    const now = Date.now();
    this.map.set(key, { value, storedAt: now, expiresAt: now + opts.freshMs + (opts.staleMs ?? 0) });
    this.evict();
  }

  async swr<T>(
    key: string,
    fetcher: () => Promise<T>,
    opts: CacheOptions
  ): Promise<{ value: T; cached: boolean }> {
    const now = Date.now();
    const hit = this.get<T>(key);

    if (hit && now < hit.expiresAt) {
      const fresh = now - hit.storedAt < opts.freshMs;
      if (!fresh && !this.inflight.has(key)) {
        const p = fetcher()
          .then((v) => {
            this.set(key, v, opts);
            return v;
          })
          .catch((e) => {
            // M17 fix: revalidate gagal → jangan hapus cache, biarkan stale rescue
            console.warn(`[cache] revalidate ${key} failed:`, e instanceof Error ? e.message.slice(0, 80) : String(e));
            throw e;
          })
          .finally(() => this.inflight.delete(key));
        this.inflight.set(key, p);
        p.catch(() => {});
      }
      return { value: hit.value, cached: true };
    }

    // M17 fix: jika expired tapi ada stale, dan fetcher reject → rescue stale
    const staleHit = hit;
    const existing = this.inflight.get(key);
    if (existing) {
      try {
        return { value: (await existing) as T, cached: false };
      } catch (e) {
        if (staleHit) return { value: staleHit.value, cached: true };
        throw e;
      }
    }

    const p = fetcher()
      .then((v) => {
        this.set(key, v, opts);
        return v;
      })
      .catch((e) => {
        if (staleHit) {
          console.warn(`[cache] fetch ${key} failed, rescue stale:`, e instanceof Error ? e.message.slice(0, 80) : String(e));
          return staleHit.value;
        }
        throw e;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    const value = await p;
    // jika rescue stale, value adalah staleHit.value — tapi kita sudah catch di atas
    // jadi hit? kembalikan sebagai cached true jika dari rescue
    if (staleHit && value === staleHit.value) return { value, cached: true };
    return { value, cached: false };
  }

  delete(key: string) {
    this.map.delete(key);
  }

  get size() {
    return this.map.size;
  }
}

export const globalCache = new TtlCache(800);

/** fetch dengan timeout supaya tidak ada request menggantung. */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 12_000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    // Gabungkan signal caller (bila ada) dengan signal timeout internal —
    // jangan menimpa, supaya AbortController milik pemanggil tetap bisa abort.
    // Fallback Node <20.3 yang belum punya AbortSignal.any
    let signal: AbortSignal;
    if (rest.signal) {
      if (typeof (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any === "function") {
        signal = (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any([ctrl.signal, rest.signal]);
      } else {
        // polyfill manual: abort salah satu → abort gabungan
        const anyCtrl = new AbortController();
        const onAbort = () => anyCtrl.abort((rest.signal as AbortSignal).reason ?? ctrl.signal.reason);
        ctrl.signal.addEventListener("abort", onAbort, { once: true });
        rest.signal.addEventListener("abort", onAbort, { once: true });
        signal = anyCtrl.signal;
      }
    } else {
      signal = ctrl.signal;
    }
    return await fetch(input, { ...rest, signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Blockscout Robinhood diblokir Cloudflare tanpa User-Agent browser. */
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
