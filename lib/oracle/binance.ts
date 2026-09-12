/**
 * lib/oracle/binance.ts — Tier 2: push stream Binance (sub-detik, keyless).
 *
 * Menutup celah heartbeat Chainlink 24 jam untuk aset mayor.
 * WebSocket singleton di sisi server; UI tidak pernah membuka WS langsung.
 */

import { globalCache } from "../cache";

const PAIRS = ["ethusdt", "btcusdt", "bnbusdt", "hypeusdt", "solusdt", "linkusdt", "dogeusdt", "xrpusdt"];
const WS_URL = `wss://stream.binance.com:9443/stream?streams=${PAIRS.map((p) => `${p}@ticker`).join("/")}`;

export const BINANCE_SYMBOLS: Record<string, string> = {
  ETH: "ETHUSDT",
  WETH: "ETHUSDT",
  BTC: "BTCUSDT",
  WBTC: "BTCUSDT",
  CBBTC: "BTCUSDT",
  BNB: "BNBUSDT",
  WBNB: "BNBUSDT",
  HYPE: "HYPEUSDT",
  WHYPE: "HYPEUSDT",
  SOL: "SOLUSDT",
  LINK: "LINKUSDT",
  DOGE: "DOGEUSDT",
  XRP: "XRPUSDT",
};

export interface StreamTicker {
  symbol: string;
  usd: number;
  change24h: number | null;
  updatedAt: number;
}

const STORE_KEY = "binance:ticks";

interface StreamState {
  ws?: WebSocket;
  started: boolean;
  lastMessageAt: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  attempts: number;
}

const globalRef = globalThis as unknown as { __binanceStream?: StreamState };
const state: StreamState = (globalRef.__binanceStream ??= {
  started: false,
  lastMessageAt: 0,
  attempts: 0,
});

export function getTicks(): Record<string, StreamTicker> {
  return (globalCache.get<Record<string, StreamTicker>>(STORE_KEY)?.value ?? {}) as Record<
    string,
    StreamTicker
  >;
}

export function streamStatus() {
  const ticks = getTicks();
  return {
    connected: state.ws?.readyState === 1,
    readyState: state.ws?.readyState ?? null,
    symbols: Object.keys(ticks).length,
    lastMessageAgoMs: state.lastMessageAt ? Date.now() - state.lastMessageAt : null,
    attempts: state.attempts,
  };
}

function handleMessage(raw: string) {
  try {
    const msg = JSON.parse(raw) as { data?: { s?: string; c?: string; P?: string } };
    const d = msg.data;
    if (!d?.s || !d.c) return;
    const usd = Number(d.c);
    if (!Number.isFinite(usd) || usd <= 0) return;
    const ticks = getTicks();
    ticks[d.s] = {
      symbol: d.s,
      usd,
      change24h: d.P !== undefined ? Number(d.P) : null,
      updatedAt: Date.now(),
    };
    globalCache.set(STORE_KEY, ticks, { freshMs: 60_000, staleMs: 600_000 });
    state.lastMessageAt = Date.now();
  } catch {
    /* pesan tak dikenal */
  }
}

/** Mulai stream (idempoten). */
export function ensureStream(): void {
  if (state.started) return;
  if (typeof WebSocket === "undefined") return; // Node < 21.7
  state.started = true;

  const connect = () => {
    try {
      const ws = new WebSocket(WS_URL);
      state.ws = ws;
      state.attempts += 1;
      ws.onmessage = (ev: MessageEvent) => handleMessage(String(ev.data));
      ws.onerror = () => {};
      ws.onclose = () => {
        state.started = false;
        if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(state.attempts, 5));
        state.reconnectTimer = setTimeout(() => ensureStream(), delay);
      };
    } catch {
      state.started = false;
    }
  };

  connect();
}

export function getStreamPrice(symbol: string): StreamTicker | null {
  const pair = BINANCE_SYMBOLS[symbol.toUpperCase()];
  if (!pair) return null;
  const t = getTicks()[pair];
  if (!t) return null;
  if (Date.now() - t.updatedAt > 60_000) return null; // anggap basi
  return t;
}

/** Tunggu sampai stream punya data (dipakai saat cold start). */
export async function waitForTicks(timeoutMs = 4000): Promise<void> {
  ensureStream();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (Object.keys(getTicks()).length > 0) return;
    await new Promise((r) => setTimeout(r, 200));
  }
}
