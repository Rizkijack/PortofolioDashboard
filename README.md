# Onchain Portfolio Dashboard — 5 EVM Real-time

Minimal-bold dashboard untuk tracking portofolio onchain secara **real-time** di 5 jaringan EVM: **Base (8453), BSC (56), Ink (57073), HyperEVM (999), Robinhood Chain (4663)**.

Tema: **minimal-bold** — bento grid, off-black + white, 1 accent emerald, typography Geist, tanpa purple glow.

## Arsitektur Simple

```
Wallet (Reown AppKit + Privy adapter / injected fallback)
  → wagmi/viem + fallback RPC
    → Portfolio Engine (multicall: native + ERC20 curated)
      → Oracle Hybrid (DeFiLlama 2s poll + CoinGecko fallback + Pyth WS ready)
        → Next.js 16 API Proxy (/api/prices, /api/portfolio)
          → UI (NetWorth bento + ChainGrid + AssetsTable + Price Ticker)
```

No heavy indexer, no DB. Serverless-ready Vercel. Semua fetch via viem fallback + edge cache `s-maxage=1-2`.

## Stack

- **Next.js 16.3.5** (App Router, Turbopack)
- **Tailwind v4** + Geist
- **wagmi / viem** (siap aktif setelah `pnpm add wagmi viem`)
- **TanStack Query** (optional, fallback passthrough)
- **Reown AppKit** (WalletConnect) + Privy adapter
- **Recharts-ready** (sparkline placeholder)

## Chains

| Chain | ID | RPC | Explorer |
|-------|----|-----|----------|
| Base | 8453 | `https://mainnet.base.org` | basescan.org |
| BSC | 56 | `https://bsc-dataseed.binance.org` | bscscan.com |
| Ink | 57073 | `https://rpc-gel.inkonchain.com` | explorer.inkonchain.com |
| HyperEVM | 999 | `https://rpc.hyperliquid.xyz/evm` | hyperevmscan.io |
| Robinhood | 4663 | `https://mainnet.rpc.robinhoodchain.io` | robinhoodchain.blockscout.com |

Chain config di `lib/chains.ts` — semua RPC configurable via env.

## Oracle Real-time

- **Primary:** DeFiLlama `https://coins.llama.fi/prices/current/...` poll **2s**, cache **1s**
- **Fallback:** CoinGecko `simple/price` poll **5s**
- **WS-ready:** Pyth Hermes `wss://hermes.pyth.network/ws` (hook `usePrices` sudah polling, tinggal swap ke WS)
- UI menampilkan `priceUpdatedAt` + pulse hijau + `2s poll` badge → klaim real-time verifiable.

## Wallet — Privy / Reown

- `NEXT_PUBLIC_REOWN_PROJECT_ID` dari **cloud.reown.com** → untuk AppKit WalletConnect
- `NEXT_PUBLIC_PRIVY_APP_ID` dari **dashboard.privy.io** → opsional, jika diisi UI toggle ke Privy
- Saat ini **injected wallet** (MetaMask/Rabby) sudah jalan sebagai fallback, jadi dashboard bisa dites tanpa API key.

> Kredensial bisa diisi terakhir — struktur sudah 100% jalan dengan demo data.

## Quick Start

```bash
cp .env.example .env.local
# isi REOWN_PROJECT_ID / PRIVY_APP_ID / ALCHEMY_KEY jika ada

pnpm install
pnpm dev
# http://localhost:3000
```

Demo data: jika wallet belum connect, portfolio generate mock deterministic dari address (atau `0xdead…`) + price map live, jadi UI tetap terlihat real.

## API Routes

- `GET /api/prices?ids=ethereum,usd-coin,binancecoin` → `PriceMap`
- `GET /api/portfolio?address=0x...` → `PortfolioSummary` (totalUsd, byChain, positions)
- `GET /api/chains` (TODO) → chain health

Semua API proxy cache `s-maxage=1-2, stale-while-revalidate`.

## File Tree

```
app/
  layout.tsx (Providers)
  page.tsx (dashboard bento)
  globals.css (minimal-bold tokens)
  api/prices/route.ts
  api/portfolio/route.ts
lib/
  chains.ts (5 chains, fallback viem)
  tokens.ts (curated per chain)
  prices.ts (hybrid oracle)
  portfolio.ts (mock + onchain stub)
  utils.ts (fmt)
components/
  providers.tsx (Query fallback)
  wallet/connect-button.tsx
  dashboard/networth-card, chain-grid, assets-table, price-ticker
hooks/
  usePrices (2s poll), usePortfolio (8s)
```

## Next Steps (setelah struktur)

1. `pnpm add wagmi viem @tanstack/react-query @reown/appkit @reown/appkit-adapter-wagmi`
2. Aktifkan `lib/wagmi.ts` (uncomment) + `components/providers.tsx` ke WagmiProvider + AppKit
3. Implement `fetchPortfolioOnchain` via `publicClient.multicall` (balanceOf + getBalance)
4. Swap `usePrices` poll ke Pyth WS jika mau <400ms
5. Deploy Vercel, isi env.

## Verifikasi

```bash
pnpm build
# Expected: ✓ Compiled successfully
pnpm lint
```

## License

MIT — built with Opencode2 harness, minimal-bold, verifiable real-time.
