import { NextRequest, NextResponse } from "next/server";
import { isAddress, parseChainKeys } from "@/lib/chains";
import { fetchChainPortfolio } from "@/lib/portfolio";
import { resolveQuotes, ensureStream } from "@/lib/oracle";
import { rateLimit } from "@/lib/rate-limit";
import type { ChainKey } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/stream?address=0x…&chains=base,bsc&interval=5000
 *
 * Server-Sent Events:
 *   hello     — sekali di awal
 *   portfolio — snapshot nilai total per chain (saat berubah)
 *   prices    — delta harga token yang dipegang (saat berubah)
 *   heartbeat — tiap 15s supaya proxy tidak memutus
 *   error     — kegagalan non-fatal per chain
 */
const STREAM_START = new Map<string, number>();
const STREAM_MAX_RUNTIME_MS = 60_000;
const STREAM_MAX_CONCURRENT = 3;

export async function GET(req: NextRequest) {
  const rl = rateLimit(req);
  if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const sp = req.nextUrl.searchParams;
  const address = sp.get("address");
  if (!isAddress(address)) {
    return new Response("invalid address", { status: 400 });
  }

  const chains = parseChainKeys(sp.get("chains"));
  const intervalRaw = Number(sp.get("interval") ?? 5000);
  const interval = Number.isFinite(intervalRaw) ? Math.min(20_000, Math.max(3_000, intervalRaw)) : 5000;

  // M26 fix: cap concurrent SSE per-IP & max runtime 60s
  const ip = req.headers.get("x-real-ip") || req.headers.get("x-vercel-forwarded-for")?.split(",")[0] || req.headers.get("x-forwarded-for")?.split(",")[0] || "local";
  const now = Date.now();
  // cleanup old
  for (const [k, v] of STREAM_START) if (now - v > STREAM_MAX_RUNTIME_MS + 5_000) STREAM_START.delete(k);
  const concurrent = [...STREAM_START.keys()].filter((k) => k.startsWith(`${ip}:`)).length;
  if (concurrent >= STREAM_MAX_CONCURRENT) {
    return NextResponse.json({ error: "too many streams" }, { status: 429, headers: { "Retry-After": "10" } });
  }
  const streamKey = `${ip}:${address}:${now}`;
  STREAM_START.set(streamKey, now);
  const startedAt = now;

  ensureStream();

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send("hello", { intervalMs: interval, chains, address });

      let lastTotal: number | null | undefined = undefined;
      const lastQuotes = new Map<string, string>();

      const tick = async () => {
        if (closed) return;
        try {
          const settled = await Promise.all(
            chains.map(async (chain) => {
              try {
                return await fetchChainPortfolio(chain, address);
              } catch (e) {
                send("error", {
                  chain,
                  message: e instanceof Error ? e.message.slice(0, 160) : String(e),
                });
                return null;
              }
            })
          );

          const good = settled.filter((c): c is NonNullable<typeof c> => !!c);
          const priced = good.filter((c) => c.totalValueUsd !== null);
          const total = priced.length ? priced.reduce((s, c) => s + (c.totalValueUsd ?? 0), 0) : null;

          if (total !== lastTotal) {
            send("portfolio", {
              totalValueUsd: total,
              allocation: priced.map((c) => ({ chain: c.chain, valueUsd: c.totalValueUsd ?? 0 })),
              changedAt: Date.now(),
            });
            lastTotal = total;
          }

          const tokens = good.flatMap((c) =>
            c.tokens.map((t) => ({
              chain: c.chain,
              address: t.address,
              symbol: t.symbol,
              isNative: t.isNative,
            }))
          );

          if (tokens.length) {
            const byChain = new Map<string, typeof tokens>();
            for (const t of tokens) {
              const l = byChain.get(t.chain) ?? [];
              l.push(t);
              byChain.set(t.chain, l);
            }
            const quotes: Record<string, unknown> = {};
            await Promise.all(
              [...byChain.entries()].map(async ([chain, list]) => {
                const resolved = await resolveQuotes(chain as ChainKey, list).catch(() => new Map());
                for (const t of list) {
                  const q = resolved.get(t.address.toLowerCase());
                  if (q) quotes[`${chain}:${t.address.toLowerCase()}`] = q;
                }
              })
            );

            const changed: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(quotes)) {
              const q = v as { usd: number | null; updatedAt: number };
              const sig = `${q.usd}|${q.updatedAt}`;
              if (lastQuotes.get(k) !== sig) {
                changed[k] = v;
                lastQuotes.set(k, sig);
              }
            }
            if (Object.keys(changed).length) {
              send("prices", { quotes: changed, fetchedAt: Date.now() });
            }
          }
        } catch (e) {
          send("error", { message: e instanceof Error ? e.message.slice(0, 160) : "tick failed" });
        }
      };

      // Tick berikutnya baru dijadwalkan SETELAH tick selesai (await) —
      // mencegah overlap bila resolveQuotes lebih lambat dari interval.
      let tickTimer: ReturnType<typeof setTimeout> | undefined;
      const scheduleTick = () => {
        tickTimer = setTimeout(async () => {
          await tick();
          if (!closed) scheduleTick();
        }, interval);
      };

      await tick();
      scheduleTick();
      const hbTimer = setInterval(() => send("heartbeat", { t: Date.now() }), 15_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        STREAM_START.delete(streamKey);
        if (tickTimer) clearTimeout(tickTimer);
        clearInterval(hbTimer);
        try {
          controller.close();
        } catch {
          /* sudah tertutup */
        }
      };

      req.signal.addEventListener("abort", cleanup);
      // auto-close setelah 60s untuk hindari SSE abadi
      setTimeout(() => {
        if (!closed && Date.now() - startedAt >= STREAM_MAX_RUNTIME_MS) {
          send("close", { reason: "max_runtime" });
          cleanup();
        }
      }, STREAM_MAX_RUNTIME_MS + 1_000);
    },
    cancel() {
      closed = true;
      STREAM_START.delete(streamKey);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
