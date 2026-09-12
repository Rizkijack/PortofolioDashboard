import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { supportedChains } from "./chains";

export const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

export const hasReownProjectId = /^[a-f0-9]{32}$/i.test(projectId);

export const wagmiAdapter = new WagmiAdapter({
  networks: supportedChains as unknown as ConstructorParameters<typeof WagmiAdapter>[0]["networks"],
  projectId: projectId || "0".repeat(32),
  ssr: true,
  storage: createStorage({ storage: cookieStorage }),
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;

export const appkitMetadata = {
  name: "Onchain Portfolio",
  description: "Real-time on-chain portfolio tracker — Robinhood Chain, Base, BSC, HyperEVM, Ink",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  icons: ["https://avatars.githubusercontent.com/u/37784886"],
};
