/**
 * lib/rpc.ts — public client per chain + failover.
 */

import { createPublicClient, http, type PublicClient } from "viem";
import { CHAINS, RPC_FAILOVER, VIEM_CHAINS } from "./chains";
import type { ChainKey } from "./types";

const clients = new Map<string, PublicClient>();

export function getPublicClient(chain: ChainKey, rpcUrl?: string): PublicClient {
  const url = rpcUrl ?? RPC_FAILOVER[chain][0];
  const key = `${chain}|${url}`;
  const cached = clients.get(key);
  if (cached) return cached;

  const client = createPublicClient({
    chain: VIEM_CHAINS[chain],
    transport: http(url, { batch: true, retryCount: 1, retryDelay: 250, timeout: 15_000 }),
  }) as PublicClient;

  clients.set(key, client);
  return client;
}

/** Jalankan operasi; bila gagal, coba RPC failover berikutnya. */
export async function withFailover<T>(
  chain: ChainKey,
  fn: (client: PublicClient) => Promise<T>
): Promise<{ value: T; rpcUrl: string; errors: string[] }> {
  const errors: string[] = [];
  for (const url of RPC_FAILOVER[chain]) {
    try {
      const value = await fn(getPublicClient(chain, url));
      return { value, rpcUrl: url, errors };
    } catch (e) {
      errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(`all RPC failed for ${chain}: ${errors.join(" | ")}`);
}

export interface RpcHealth {
  url: string;
  ok: boolean;
  latencyMs: number | null;
  blockNumber: string | null;
}

export async function probeRpc(chain: ChainKey, url: string, timeoutMs = 6000): Promise<RpcHealth> {
  const t0 = Date.now();
  try {
    const client = getPublicClient(chain, url);
    const block = await Promise.race([
      client.getBlockNumber(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
    ]);
    return { url, ok: true, latencyMs: Date.now() - t0, blockNumber: "0x" + block.toString(16) };
  } catch {
    return { url, ok: false, latencyMs: null, blockNumber: null };
  }
}

export async function probeAll(chain: ChainKey): Promise<RpcHealth[]> {
  return Promise.all(RPC_FAILOVER[chain].map((u) => probeRpc(chain, u)));
}

export function chainMetaOf(chain: ChainKey) {
  return CHAINS[chain];
}
