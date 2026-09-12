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

// Reown AppKit — aktifkan setelah pnpm add @reown/appkit @reown/appkit-adapter-wagmi
// import { createAppKit } from "@reown/appkit/react";
// import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
// const wagmiAdapter = new WagmiAdapter({ networks: supportedChains as any, projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID! });
// export const appKit = createAppKit({ adapters: [wagmiAdapter], networks: supportedChains as any, projectId: process.env.NEXT_PUBLIC_REOWN_PROJECT_ID!, metadata: { name: "Portfolio Dashboard", description: "Onchain portfolio tracker", url: "https://example.com", icons: [] } });
