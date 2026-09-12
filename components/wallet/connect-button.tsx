"use client";

import { useEffect, useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useAppKit } from "@reown/appkit/react";
import { shortAddr } from "@/lib/utils";
import { hasReownProjectId } from "@/lib/wagmi";

type Props = {
  onConnect?: (addr: string) => void;
  onDisconnect?: () => void;
};

export function ConnectButton({ onConnect, onDisconnect }: Props) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();
  const [isPrivy, setIsPrivy] = useState(false);
  const [injectedAddr, setInjectedAddr] = useState<string | null>(null);

  // Fallback injected if Reown not configured
  const connectInjected = async () => {
    const eth = (window as any).ethereum;
    if (!eth) {
      alert("No wallet found. Install MetaMask/Rabby");
      return;
    }
    const accounts: string[] = await eth.request({ method: "eth_requestAccounts" });
    if (accounts[0]) {
      setInjectedAddr(accounts[0]);
      onConnect?.(accounts[0]);
    }
  };

  const handleDisconnect = () => {
    if (isConnected) disconnect();
    setInjectedAddr(null);
    onDisconnect?.();
  };

  // Notify parent when wagmi address changes
  useEffect(() => {
    if (address) onConnect?.(address);
    else if (injectedAddr) onConnect?.(injectedAddr);
  }, [address, injectedAddr, onConnect]);

  useEffect(() => {
    setIsPrivy(!!process.env.NEXT_PUBLIC_PRIVY_APP_ID);
    if (!hasReownProjectId) {
      const eth = (window as any).ethereum;
      if (eth) {
        eth.request({ method: "eth_accounts" }).then((accs: string[]) => {
          if (accs[0]) {
            setInjectedAddr(accs[0]);
            onConnect?.(accs[0]);
          }
        });
      }
    }
  }, [onConnect]);

  const displayAddr = address || injectedAddr;

  if (displayAddr) {
    return (
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-sm font-mono font-medium">{shortAddr(displayAddr)}</span>
          <span className="text-[11px] uppercase tracking-widest text-zinc-500">connected</span>
        </div>
        <button onClick={handleDisconnect} className="rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-4 py-2 text-sm font-semibold hover:opacity-90">
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => (hasReownProjectId ? open() : connectInjected())}
        className="rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-5 py-2.5 text-sm font-semibold tracking-tight hover:opacity-90 transition"
      >
        Connect Wallet
      </button>
      <span className="hidden lg:inline text-xs text-zinc-500">
        {hasReownProjectId ? "Reown • live" : isPrivy ? "Privy • demo" : "Injected • demo"} • 74c3…d008
      </span>
    </div>
  );
}
