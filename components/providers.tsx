"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";
import { createAppKit } from "@reown/appkit/react";
import { wagmiAdapter, appkitMetadata, projectId } from "@/lib/wagmi";
import { supportedChains } from "@/lib/chains";

// Init Reown AppKit once — must run both server & client before any useAppKit() call
declare global {
  var __appkit_init: boolean | undefined;
}

if (projectId && !globalThis.__appkit_init) {
  globalThis.__appkit_init = true;
  createAppKit({
    adapters: [wagmiAdapter],
    networks: supportedChains as unknown as Parameters<typeof createAppKit>[0]["networks"],
    projectId,
    metadata: appkitMetadata,
    features: { analytics: false },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 2000, retry: 1 } },
      })
  );
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
