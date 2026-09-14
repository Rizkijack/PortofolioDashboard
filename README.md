# Onchain Portfolio Dashboard — 5 EVM Real-time

Minimal-bold dashboard untuk tracking portofolio onchain secara **real-time** di 5 jaringan EVM: **Base (8453), BSC (56), Ink (57073), HyperEVM (999), Robinhood Chain (4663)**.

Tema: **minimal-bold** — bento grid, off-black + white, 1 accent emerald, typography Geist, tanpa purple glow.

---

*Deployed at [dashboardportofolio.vercel.app](https://dashboardportofolio.vercel.app)*
*Production branch: `main`*

## Arsitektur Simple

```
Wallet (Reown AppKit + injected fallback)
  → wagmi/viem + RPC failover per chain
    → Portfolio Engine (multi-provider discovery: Blockscout v2, Rabby Open API, Zerion, OKX, Routescan, Etherscan + on-chain multicall verification)
      → Oracle berlapis (Chainlink on-chain → RedStone push/API → Binance WS → DexScreener → Blockscout rate)
        → Next.js 16 Route Handlers (/api/portfolio, /api/prices, /api/chains, /api/token, /api/stream SSE)
          → UI (NetWorth bento + ChainGrid + AssetsTable + Price Ticker)
```

No heavy indexer, no DB. Serverless-ready Vercel. Harga `null` → tampil "—", tidak pernah dikarang.

## Stack

- **Next.js 16.3.5** (App Router, Turbopack)
- **Tailwind v4** + Geist
- **wagmi / viem** (multicall + RPC failover)
- **TanStack Query**
- **Reown AppKit** (WalletConnect) + injected fallback
- **lightweight-charts** (chart token detail)

## Chains

| Chain | ID | RPC | Explorer |
|-------|----|-----|----------|
| Base | 8453 | `https://mainnet.base.org` | basescan.org |
| BSC | 56 | `https://bsc-dataseed.binance.org` | bscscan.com |
| Ink | 57073 | `https://rpc-gel.inkonchain.com` | explorer.inkonchain.com |
| HyperEVM | 999 | `https://rpc.hyperliquid.xyz/evm` | hyperevmscan.io |
| Robinhood | 4663 | `https://robinhood-rpc.publicnode.com` | robinhoodchain.blockscout.com |

Chain config di `lib/chains.ts` (`RPC_FAILOVER`) — semua RPC configurable via env, failover otomatis via `withFailover()`.

## Oracle Real-time

- **Tier 1:** Chainlink on-chain (`latestRoundData` via multicall) + RedStone push feed (Ink)
- **Tier 2:** Binance WS stream (sub-detik, aset mayor: ETH/BTC/BNB/HYPE/SOL/LINK/DOGE/XRP) + RedStone API (median multi-exchange)
- **Tier 3:** DexScreener (long-tail) + Blockscout `exchange_rate` (token Robinhood)
- Aturan keras: tidak ada harga → `usd: null` → UI tampil "—". Tidak ada fallback statis.
- Push ke UI via SSE `/api/stream` (event `portfolio` + `prices`), snapshot penuh tiap 20s sebagai jaring pengaman.

## Wallet — Privy / Reown

- `NEXT_PUBLIC_REOWN_PROJECT_ID` dari **cloud.reown.com** → untuk AppKit WalletConnect
- `NEXT_PUBLIC_PRIVY_APP_ID` dari **dashboard.privy.io** → opsional, jika diisi UI toggle ke Privy
- Saat ini **injected wallet** (MetaMask/Rabby) sudah jalan sebagai fallback, jadi dashboard bisa dites tanpa API key.

> Tanpa `NEXT_PUBLIC_REOWN_PROJECT_ID`, connect fallback ke injected wallet (MetaMask/Rabby).

## Quick Start

```bash
cp .env.example .env.local
# isi NEXT_PUBLIC_REOWN_PROJECT_ID dari cloud.reown.com

pnpm install
pnpm dev
# http://localhost:3000
```

Tanpa wallet terhubung, dashboard menampilkan empty state (bukan angka contoh) — hubungkan wallet untuk saldo live on-chain.

## API Routes

- `GET /api/prices?ids=ethereum,usd-coin,binancecoin` → `{ quotes, fetchedAt, missing }` (slug ticker)
- `GET /api/prices?ids=base:0x…,robinhood:0x…` → `{ quotes, fetchedAt, missing }` (id kanonik, resolusi penuh)
- `GET /api/portfolio?address=0x...` → `PortfolioResponse` (chains, totalValueUsd, allocation, sourcesUsed)
- `GET /api/chains` → metadata + kesehatan RPC + status stream
- `GET /api/token/[chain]/[addr]?owner=0x…&chart=24h` → detail token + OHLCV GeckoTerminal
- `GET /api/stream?address=0x…` → SSE (`hello`, `portfolio`, `prices`, `heartbeat`)

Semua GET pakai `Cache-Control` SWR singkat; tanpa address, `/api/portfolio` 400 (tidak ada data contoh).

## File Tree

```
app/
  layout.tsx (Providers: Wagmi + Query + AppKit)
  page.tsx (dashboard bento, allocation nyata, warnings parsial)
  globals.css (dark minimal-bold tokens)
  api/prices/route.ts
  api/portfolio/route.ts
  api/chains/route.ts
  api/token/[chain]/[addr]/route.ts
  api/stream/route.ts (SSE)
lib/
  chains.ts (5 chains + RPC_FAILOVER terverifikasi)
  rpc.ts (public client + withFailover + probe)
  discovery/ (Blockscout v2 / Routescan — saldo nyata)
  oracle/ (chainlink, redstone, binance WS, dexscreener)
  prices.ts (fetchSlugQuotes + fetchQuotesFor — tanpa fallback statis)
  portfolio.ts (fetchPortfolio — multicall on-chain)
  compat.ts (PortfolioResponse → ringkasan UI)
  cache.ts (TTl + SWR + fetchWithTimeout)
  format.ts / utils.ts (null → "—")
components/
  providers.tsx (Wagmi + Query + createAppKit)
  wallet/connect-button.tsx (Reown modal + injected fallback)
  dashboard/networth-card, chain-grid, assets-table, price-ticker
hooks/
  usePrices (poll), usePortfolio (snapshot + SSE push)
```

## Verifikasi

```bash
pnpm build
# Expected: ✓ Compiled successfully
pnpm lint
```

## License

MIT — built with Opencode2 harness, minimal-bold, verifiable real-time.
