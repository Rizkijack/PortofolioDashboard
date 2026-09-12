"use client";

import { useState, useEffect } from "react";
import { shortAddr } from "@/lib/utils";

type Props = {
  onConnect?: (addr: string) => void;
  onDisconnect?: () => void;
};

export function ConnectButton({ onConnect, onDisconnect }: Props) {
  const [address, setAddress] = useState<string | null>(null);
  const [isPrivy, setIsPrivy] = useState(false);

  // Detect injected wallet (MetaMask/Rabby) as fallback before Reown/Privy keys are set
  const connectInjected = async () => {
    const eth = (window as any).ethereum;
    if (!eth) {
      alert("No wallet found. Install MetaMask/Rabby or set NEXT_PUBLIC_REOWN_PROJECT_ID / PRIVY_APP_ID");
      return;
    }
    const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
    if (accounts[0]) {
      setAddress(accounts[0]);
      onConnect?.(accounts[0]);
    }
  };

  const disconnect = () => {
    setAddress(null);
    onDisconnect?.();
  };

  useEffect(() => {
    setIsPrivy(!!process.env.NEXT_PUBLIC_PRIVY_APP_ID);
    // auto-restore if already connected
    const eth = (window as any).ethereum;
    if (eth) {
      eth.request({ method: "eth_accounts" }).then((accs: string[]) => {
        if (accs[0]) {
          setAddress(accs[0]);
          onConnect?.(accs[0]);
        }
      });
      eth.on?.("accountsChanged", (accs: string[]) => {
        if (accs[0]) {
          setAddress(accs[0]);
          onConnect?.(accs[0]);
        } else disconnect();
      });
    }
  }, []);

  if (address) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-mono font-medium">{shortAddr(address)}</span>
          <span className="text-[11px] uppercase tracking-widest text-zinc-500">connected</span>
        </div>
        <button onClick={disconnect} className="rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-4 py-2 text-sm font-semibold hover:opacity-90">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={connectInjected}
        className="rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-5 py-2.5 text-sm font-semibold tracking-tight hover:opacity-90 transition"
      >
        Connect Wallet
      </button>
      <span className="hidden lg:inline text-xs text-zinc-500">
        {isPrivy ? "Privy" : "Reown"} ready • {process.env.NEXT_PUBLIC_REOWN_PROJECT_ID && process.env.NEXT_PUBLIC_REOWN_PROJECT_ID !== "demo-project-id-replace-with-real" ? "live" : "demo"}
      </span>
    </div>
  );
}
