/**
 * lib/tx.ts — Transaction history fetcher (Blockscout v2 + Routescan fallback)
 *
 * - Blockscout v2: GET {base}/api/v2/addresses/{address}/transactions?items_count=20
 * - BSC fallback via Routescan (Etherscan compatible)
 * - Cache via globalCache.swr fresh 10s stale 60s
 */

import { fetchWithTimeout, globalCache } from "./cache";
import type { ChainKey } from "./types";
import { CHAINS } from "./chains";
import { rawToDecimalString } from "./format";

export interface TxItem {
  hash: string;
  chain: ChainKey;
  chainId: number;
  from: string;
  to: string | null;
  value: string;
  formattedValue: string;
  timestamp: number | null;
  status: "ok" | "failed" | "pending";
  method?: string | null;
  tokenTransfers?: Array<{ token: string; symbol: string; from: string; to: string; value: string }>;
  fee?: string | null;
  blockNumber?: number | null;
}

export interface TxPage {
  items: TxItem[];
  nextPageParams?: Record<string, string> | null;
  hasMore: boolean;
}

const V2_BASES: Partial<Record<ChainKey, string>> = {
  base: "https://base.blockscout.com",
  ink: "https://explorer.inkonchain.com",
  robinhood: "https://robinhoodchain.blockscout.com",
  hyperevm: "https://hyperevmscan.io",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function browserHeaders(base: string, refererPath = "/"): Record<string, string> {
  return {
    accept: "application/json, text/plain, */*",
    "accept-language": "en-US,en;q=0.9",
    "user-agent": UA,
    referer: `${base}${refererPath}`,
    origin: base,
    "sec-fetch-site": "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
  };
}

// ─────────────── helpers ───────────────

function parseTimestamp(v: unknown): number | null {
  if (typeof v === "string") {
    const ms = Date.parse(v);
    if (Number.isFinite(ms)) return ms;
    // numeric string epoch seconds?
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) {
      // heuristic: if <1e12 treat as seconds
      return n < 1e12 ? n * 1000 : n;
    }
    return null;
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return v < 1e12 ? v * 1000 : v;
  }
  return null;
}

function parseMethod(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // direct method field
  if (typeof r.method === "string" && r.method.trim()) return r.method.trim();
  // decoded_input
  const di = r.decoded_input as Record<string, unknown> | undefined;
  if (di) {
    if (typeof di.method_call === "string" && di.method_call.trim()) {
      // "transfer(address,uint256)" → "transfer"
      const m = di.method_call.split("(")[0].trim();
      if (m) return m;
    }
    if (typeof di.method_id === "string" && di.method_id.trim()) return di.method_id.trim();
  }
  return null;
}

function parseFee(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number") return String(raw);
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (typeof o.value === "string") return o.value;
    if (typeof o.value === "number") return String(o.value);
  }
  return null;
}

function parseHash(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.hash === "string") return o.hash;
  }
  return "";
}

function parseAddr(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.hash === "string") return o.hash;
    if (typeof o.address === "string") return o.address;
  }
  return null;
}

function toTxItem(raw: unknown, chain: ChainKey): TxItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const hash = parseHash(r.hash ?? r.transaction_hash ?? r.tx_hash);
  if (!hash || !hash.startsWith("0x")) return null;

  const from = parseAddr(r.from) ?? "";
  const to = parseAddr(r.to);
  const value = typeof r.value === "string" ? r.value : typeof r.value === "number" ? String(r.value) : "0";

  const meta = CHAINS[chain];
  let formattedValue = "0";
  try {
    formattedValue = rawToDecimalString(value, meta?.nativeDecimals ?? 18);
  } catch {
    formattedValue = value;
  }

  const ts = parseTimestamp(r.timestamp ?? r.timeStamp ?? r.block_timestamp);
  const method = parseMethod(r) ?? (typeof r.method === "string" ? r.method : null);

  // status mapping
  let status: TxItem["status"] = "ok";
  const rawStatus = (r.status as string) ?? (r.tx_status as string) ?? "";
  if (rawStatus === "failed" || rawStatus === "error" || r.isError === "1" || r.is_error === 1 || r.status === "0x0") {
    status = "failed";
  } else if (rawStatus === "pending" || r.status === null) {
    status = "pending";
  } else if (typeof r.result === "string" && r.result === "0") {
    // etherscan isError 0 = ok, 1 = failed; already handled via isError
  }
  // Blockscout specific: status "ok" | "error"
  if (typeof r.status === "string") {
    if (r.status === "ok") status = "ok";
    else if (r.status === "error" || r.status === "failed") status = "failed";
  }
  if (typeof r.isError === "string") {
    status = r.isError === "1" ? "failed" : "ok";
  }

  // token transfers
  let tokenTransfers: TxItem["tokenTransfers"] = undefined;
  const tt = r.token_transfers ?? r.tokenTransfers;
  if (Array.isArray(tt)) {
    tokenTransfers = tt
      .map((x) => {
        if (!x || typeof x !== "object") return null;
        const o = x as Record<string, unknown>;
        const tokenAddr =
          (o.token as Record<string, unknown>)?.address_hash ??
          (o.token as Record<string, unknown>)?.address ??
          o.token_address ??
          o.contractAddress ??
          "";
        const sym = (o.token as Record<string, unknown>)?.symbol ?? o.token_symbol ?? o.tokenSymbol ?? "";
        return {
          token: typeof tokenAddr === "string" ? tokenAddr : "",
          symbol: typeof sym === "string" ? sym : "",
          from: parseAddr(o.from) ?? "",
          to: parseAddr(o.to) ?? "",
          value: typeof o.total === "string" ? o.total : typeof o.value === "string" ? o.value : String(o.value ?? ""),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x && !!x.token);
    if (tokenTransfers.length === 0) tokenTransfers = undefined;
  }

  const fee = parseFee(r.fee ?? r.tx_fee ?? r.gas_used ?? null);
  const blockNumber =
    typeof r.block_number === "number"
      ? r.block_number
      : typeof r.blockNumber === "number"
        ? r.blockNumber
        : typeof r.block_number === "string"
          ? Number(r.block_number) || null
          : typeof r.blockNumber === "string"
            ? Number(r.blockNumber) || null
            : null;

  return {
    hash,
    chain,
    chainId: meta.chainId,
    from,
    to,
    value,
    formattedValue,
    timestamp: ts,
    status,
    method: method ?? null,
    tokenTransfers,
    fee,
    blockNumber,
  };
}

// ─────────────── Blockscout fetcher ───────────────

async function fetchBlockscoutPage(
  chain: ChainKey,
  base: string,
  address: string,
  limit: number,
  nextPageParams?: Record<string, string>
): Promise<TxPage> {
  const params = new URLSearchParams();
  params.set("items_count", String(limit));
  if (nextPageParams) {
    for (const [k, v] of Object.entries(nextPageParams)) {
      if (v !== undefined && v !== null && String(v).trim() !== "") params.set(k, String(v));
    }
  }
  const url = `${base}/api/v2/addresses/${address}/transactions?${params.toString()}`;

  const res = await fetchWithTimeout(url, {
    timeoutMs: 15_000,
    headers: browserHeaders(base, `/address/${address}`),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`blockscout(${chain}) ${res.status}`);

  const json = (await res.json()) as unknown;
  // Some deployments return array directly; normal returns { items, next_page_params }
  let items: unknown[] = [];
  let next: Record<string, string> | null = null;
  if (Array.isArray(json)) {
    items = json;
  } else if (json && typeof json === "object") {
    const o = json as Record<string, unknown>;
    if (Array.isArray(o.items)) items = o.items as unknown[];
    if (o.next_page_params && typeof o.next_page_params === "object") {
      const np = o.next_page_params as Record<string, unknown>;
      // normalize to string record
      const normalized: Record<string, string> = {};
      let has = false;
      for (const [k, v] of Object.entries(np)) {
        if (v !== null && v !== undefined) {
          normalized[k] = String(v);
          has = true;
        }
      }
      next = has ? normalized : null;
    }
  }

  const txs = items.map((x) => toTxItem(x, chain)).filter((x): x is TxItem => !!x);
  return { items: txs, nextPageParams: next, hasMore: !!next };
}

// ─────────────── BSC fallback via Routescan ───────────────

interface RoutescanTx {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  timeStamp: string;
  isError: string;
  functionName?: string;
  blockNumber: string;
  gasPrice?: string;
  gasUsed?: string;
}

async function fetchBscViaRoutescan(
  address: string,
  limit: number,
  nextPageParams?: Record<string, string>
): Promise<TxPage> {
  const page = nextPageParams?.page ? Number(nextPageParams.page) : 1;
  const offset = limit;
  // Routescan endpoint mirrors etherscan
  const base = "https://api.routescan.io";
  const url =
    `https://api.routescan.io/v2/network/mainnet/evm/56/etherscan/api` +
    `?module=account&action=txlist&address=${address}&page=${page}&offset=${offset}&sort=desc`;

  const res = await fetchWithTimeout(url, {
    timeoutMs: 15_000,
    headers: browserHeaders(base, "/"),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`routescan(bsc) ${res.status}`);
  const json = (await res.json()) as { status?: string; message?: string; result?: unknown };

  const rows = Array.isArray(json.result) ? (json.result as RoutescanTx[]) : [];
  // Routescan may return string "No transactions found" on empty results
  const validRows = rows.filter((r) => r && typeof r === "object" && typeof (r as RoutescanTx).hash === "string");

  const items: TxItem[] = validRows
    .map((r) => {
      const raw: Record<string, unknown> = {
        hash: r.hash,
        from: r.from,
        to: r.to,
        value: r.value,
        timeStamp: r.timeStamp,
        isError: r.isError,
        method: r.functionName ? r.functionName.split("(")[0] : null,
        block_number: r.blockNumber,
        fee: r.gasPrice && r.gasUsed ? String(BigInt(r.gasPrice) * BigInt(r.gasUsed)) : null,
      };
      return toTxItem(raw, "bsc");
    })
    .filter((x): x is TxItem => !!x);

  // Pagination for routescan: if returned == limit, there is more
  const hasMore = validRows.length >= limit;
  const next = hasMore ? { page: String(page + 1) } : null;
  return { items, nextPageParams: next, hasMore };
}

// ─────────────── public API ───────────────

export async function fetchTx(
  chain: ChainKey,
  address: string,
  opts?: { limit?: number; nextPageParams?: Record<string, string> }
): Promise<TxPage> {
  const limit = Math.min(50, Math.max(1, opts?.limit ?? 20));
  const keyParts = [chain, address.toLowerCase(), String(limit), JSON.stringify(opts?.nextPageParams ?? null)];
  const cacheKey = `tx:${keyParts.join(":")}`;

  // BSC: has special handling but still cached
  if (chain === "bsc") {
    try {
      const { value } = await globalCache.swr(
        cacheKey,
        () => fetchBscViaRoutescan(address, limit, opts?.nextPageParams),
        { freshMs: 10_000, staleMs: 60_000 }
      );
      return value;
    } catch {
      // fallback to empty on error
      return { items: [], nextPageParams: null, hasMore: false };
    }
  }

  const base = V2_BASES[chain];
  if (!base) {
    return { items: [], nextPageParams: null, hasMore: false };
  }

  try {
    const { value } = await globalCache.swr(
      cacheKey,
      () => fetchBlockscoutPage(chain, base, address, limit, opts?.nextPageParams),
      { freshMs: 10_000, staleMs: 60_000 }
    );
    return value;
  } catch {
    return { items: [], nextPageParams: null, hasMore: false };
  }
}

export { V2_BASES };
