/**
 * lib/rate-limit.ts — rate-limit in-memory fixed-window per-IP.
 * Vercel: per-instance (bukan global) — cukup untuk memitigasi fan-out /api/*.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

/** Hapus entri kedaluwarsa bila map membengkak (> 10.000 entry). */
function cleanupExpired(now: number) {
  if (buckets.size <= 10_000) return;
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

function clientKey(req: Request): string {
  // Entry pertama x-forwarded-for = client asli (sisanya proxy chain).
  const fwd = req.headers.get("x-forwarded-for");
  const first = fwd?.split(",")[0]?.trim();
  if (first) return first;
  return req.headers.get("x-real-ip")?.trim() || "local";
}

/**
 * Cek kuota request per-IP dalam window tetap.
 * Return `{ ok: false, retryAfterSec }` bila kuota terlampaui.
 */
export function rateLimit(
  req: Request,
  limit = 60,
  windowMs = 60_000
): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  cleanupExpired(now);

  const key = clientKey(req);
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }
  return { ok: true, retryAfterSec: 0 };
}
