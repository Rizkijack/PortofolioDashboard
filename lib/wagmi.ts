// Wagmi config — siap aktif setelah pnpm add wagmi viem + Reown/Privy
// Untuk sekarang di-stub agar build tidak fail saat deps belum terinstall.
// Aktifkan dengan mengganti Providers di components/providers.tsx.

/*
// === Aktifkan setelah install ===
// pnpm add wagmi viem @tanstack/react-query @reown/appkit @reown/appkit-adapter-wagmi

import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { supportedChains } from "./chains";

export const wagmiConfig = createConfig({
  chains: supportedChains as any,
  transports: Object.fromEntries(
    supportedChains.map((c) => [c.id, http(c.rpcUrls.default.http[0])])
  ),
  connectors: [injected()],
  ssr: true,
});

// Reown AppKit init (butuh NEXT_PUBLIC_REOWN_PROJECT_ID)
// import { createAppKit } from "@reown/appkit/react";
// import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
// const wagmiAdapter = new WagmiAdapter({ networks: supportedChains as any, projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID! });
// export const appKit = createAppKit({ adapters: [wagmiAdapter], networks: supportedChains as any, projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID!, metadata: { name: "Portfolio Dashboard", description: "Onchain portfolio tracker", url: "https://example.com", icons: [] } });
*/

export const wagmiConfig = null as any;
