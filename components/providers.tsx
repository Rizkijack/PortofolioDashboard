"use client";

import { useState, type ReactNode } from "react";

// Minimal providers — TanStack Query + wagmi/Reown akan di-inject di sini
// Untuk build awal tanpa deps, fallback ke passthrough agar tidak fail "Cannot find module"
let QueryClientProvider: any = ({ children }: any) => children;
let QueryClient: any = class {};
let hasQuery = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rq = require("@tanstack/react-query");
  QueryClient = rq.QueryClient;
  QueryClientProvider = rq.QueryClientProvider;
  hasQuery = true;
} catch {}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => (hasQuery ? new QueryClient({ defaultOptions: { queries: { staleTime: 2000, retry: 1 } } }) : null));
  if (!hasQuery || !qc) return <>{children}</>;
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
