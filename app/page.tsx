"use client";

import dynamic from "next/dynamic";

const HomePage = dynamic(() => import("@/components/dashboard/home-page"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-zinc-500 text-sm">Loading dashboard…</div>
    </div>
  ),
});

export default function Page() {
  return <HomePage />;
}
