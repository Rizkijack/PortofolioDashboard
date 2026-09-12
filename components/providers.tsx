"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";
import { createAppKit } from "@reown/appkit/react";
import { wagmiAdapter, appkitMetadata, projectId } from "@/lib/wagmi";
import { supportedChains } from "@/lib/chains";

// Init Reown AppKit once — must run both server & client before any useAppKit() call
if (projectId && !((globalThis as any).__appkit_init)) {
  (globalThis as any).__appkit_init = true;
  createAppKit({
    adapters: [wagmiAdapter],
    networks: supportedChains as any,
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
