// Curated token list — top assets per chain untuk fast portfolio discovery
// Struktur minimal: address 0x0 = native gas token

export type TokenInfo = {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logo?: string;
  coingeckoId?: string;
};

export const NATIVE = "0x0000000000000000000000000000000000000000" as const;

export const curatedTokens: TokenInfo[] = [
  // Base
  { address: NATIVE, symbol: "ETH", name: "Ether", decimals: 18, chainId: 8453, coingeckoId: "ethereum" },
  { address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", symbol: "USDC", name: "USD Coin", decimals: 6, chainId: 8453, coingeckoId: "usd-coin" },
  { address: "0x4200000000000000000000000000000000000042", symbol: "OP", name: "Optimism", decimals: 18, chainId: 8453, coingeckoId: "optimism" },
  { address: "0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb", symbol: "DAI", name: "Dai", decimals: 18, chainId: 8453, coingeckoId: "dai" },

  // BSC
  { address: NATIVE, symbol: "BNB", name: "BNB", decimals: 18, chainId: 56, coingeckoId: "binancecoin" },
  { address: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56", symbol: "BUSD", name: "BUSD", decimals: 18, chainId: 56, coingeckoId: "binance-usd" },
  { address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", symbol: "BTCB", name: "BTCB", decimals: 18, chainId: 56, coingeckoId: "bitcoin" },
  { address: "0x55d398326f99059fF775485246999027B3197955", symbol: "USDT", name: "Tether USD", decimals: 18, chainId: 56, coingeckoId: "tether" },

  // Ink
  { address: NATIVE, symbol: "ETH", name: "Ether", decimals: 18, chainId: 57073, coingeckoId: "ethereum" },
  { address: "0xB8F1190a044A6E1223C4849BF5eddF38ff76A3E1", symbol: "USDC", name: "USD Coin", decimals: 6, chainId: 57073, coingeckoId: "usd-coin" },

  // HyperEVM
  { address: NATIVE, symbol: "HYPE", name: "HYPE", decimals: 18, chainId: 999, coingeckoId: "hyperliquid" },
  { address: "0x5555555555555555555555555555555555555555", symbol: "WHYPE", name: "Wrapped HYPE", decimals: 18, chainId: 999, coingeckoId: "hyperliquid" },
  { address: "0xbB2a2bB4D4178DF3688b8B2D98f949DFe188731B", symbol: "USDH", name: "USDH", decimals: 8, chainId: 999, coingeckoId: "usd-coin" },

  // Robinhood Chain
  { address: NATIVE, symbol: "ETH", name: "Ether", decimals: 18, chainId: 4663, coingeckoId: "ethereum" },
  { address: "0x7e5E0839720d0a9e3e3a72348E00D2638f6068Af", symbol: "USDC", name: "USD Coin", decimals: 6, chainId: 4663, coingeckoId: "usd-coin" },
];

export function getTokensForChain(chainId: number): TokenInfo[] {
  return curatedTokens.filter((t) => t.chainId === chainId);
}

export function getUniqueCoingeckoIds(): string[] {
  return [...new Set(curatedTokens.map((t) => t.coingeckoId).filter(Boolean) as string[])];
}
