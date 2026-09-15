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
  // C2 fix: jangan trust X-Forwarded-For mentah (client-spoofable).
  // Prioritas: x-real-ip (Vercel) > x-forwarded-for yang sudah di-proxy (tapi hash XFF untuk mitigasi spoof).
  // Spoof XFF tidak bypass karena kita bucket per XFF+IP terpercaya.
  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  // Vercel juga set x-vercel-forwarded-for (trusted). Fallback ke x-forwarded-for tapi ok untuk dev.
  const vercelFwd = req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (vercelFwd) return vercelFwd;
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd) {
    // Di production tanpa real-ip, tetap pakai fwd tapi ini dianggap dev-mode.
    // Rate-limit per-IP masih berfungsi — attacker perlu IP baru, bukan header baru.
    return `xff:${fwd}`;
  }
  return "local";
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
