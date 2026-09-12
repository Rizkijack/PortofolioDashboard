import { defineChain } from "viem";
import { base as baseChain, bsc as bscChain } from "viem/chains";

// === Custom chains ===

export const ink = defineChain({
  id: 57073,
  name: "Ink",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_INK || "https://rpc-gel.inkonchain.com",
        "https://rpc-qnd.inkonchain.com",
        "https://ink.drpc.org",
      ],
      webSocket: ["wss://rpc-gel.inkonchain.com", "wss://rpc-qnd.inkonchain.com"],
    },
  },
  blockExplorers: {
    default: { name: "Ink Explorer", url: "https://explorer.inkonchain.com" },
  },
});

export const hyperEVM = defineChain({
  id: 999,
  name: "HyperEVM",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_HYPEREVM || "https://rpc.hyperliquid.xyz/evm"],
    },
  },
  blockExplorers: {
    default: { name: "HyperevmScan", url: "https://hyperevmscan.io" },
  },
});

export const robinhoodChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_ROBINHOOD || "https://mainnet.rpc.robinhoodchain.io"],
    },
  },
  blockExplorers: {
    default: { name: "Robinhood Explorer", url: "https://robinhoodchain.blockscout.com" },
  },
});

export const base = {
  ...baseChain,
  rpcUrls: {
    ...baseChain.rpcUrls,
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_BASE || "https://mainnet.base.org", "https://base.llamarpc.com"],
    },
  },
} as unknown as typeof baseChain;

export const bsc = {
  ...bscChain,
  rpcUrls: {
    ...bscChain.rpcUrls,
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_BSC || "https://bsc-dataseed.binance.org", "https://bsc.llamarpc.com"],
    },
  },
} as unknown as typeof bscChain;

export const supportedChains = [base, bsc, ink, hyperEVM, robinhoodChain] as const;

export type SupportedChainId = (typeof supportedChains)[number]["id"];

export const chainMeta: Record<number, { color: string; short: string; icon: string }> = {
  8453: { color: "#0052FF", short: "BASE", icon: "B" },
  56: { color: "#F0B90B", short: "BSC", icon: "B" },
  57073: { color: "#7132F5", short: "INK", icon: "I" },
  999: { color: "#00E5A0", short: "HYPE", icon: "H" },
  4663: { color: "#00C805", short: "HOOD", icon: "R" },
};

export function getChainById(id: number) {
  return supportedChains.find((c) => c.id === id) || null;
}
