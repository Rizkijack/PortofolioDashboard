import { NextResponse } from "next/server";
import { CHAINS, CHAIN_ORDER, RPC_FAILOVER } from "@/lib/chains";
import { probeRpc } from "@/lib/rpc";
import { streamStatus } from "@/lib/oracle";
import type { ChainsResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/chains — metadata + kesehatan RPC + status stream. */
export async function GET() {
  const chains = await Promise.all(
    CHAIN_ORDER.map(async (key) => {
      const urls = RPC_FAILOVER[key];
      const probes = await Promise.all(urls.map((u) => probeRpc(key, u)));
      const primary = probes[0];
      return {
        meta: CHAINS[key],
        rpc: {
          url: urls[0],
          ok: primary.ok,
          latencyMs: primary.latencyMs,
          blockNumber: primary.blockNumber,
        },
        failover: probes.slice(1).map((p) => ({ url: p.url, ok: p.ok })),
      };
    })
  );

  const body: ChainsResponse & { stream: ReturnType<typeof streamStatus> } = {
    chains,
    fetchedAt: Date.now(),
    stream: streamStatus(),
  };

  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
