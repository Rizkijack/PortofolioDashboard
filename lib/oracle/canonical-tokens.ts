export interface CanonicalToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
}

export const CANONICAL_TOKENS: Record<string, Record<string, CanonicalToken>> = {
  robinhood: {
    // Top official assets on Robinhood Chain
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168": { address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168", symbol: "USDG", name: "Global Dollar", decimals: 6 },
    "0xcec185eb182c47d1ba1efc84e6959e18cd620be4": { address: "0xcec185eb182c47d1ba1efc84e6959e18cd620be4", symbol: "CBBTC", name: "Coinbase Wrapped BTC", decimals: 8 },
    "0x492641f648a4986844848e0befe66d14817bce34": { address: "0x492641f648a4986844848e0befe66d14817bce34", symbol: "LINK", name: "Chainlink", decimals: 18 },
    "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34": { address: "0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34", symbol: "USDE", name: "Ethena USDe", decimals: 18 },
    "0xce24439f2d9c6a2289f741120fe202248b666666": { address: "0xce24439f2d9c6a2289f741120fe202248b666666", symbol: "U", name: "United Stables", decimals: 18 },
    "0x0bd7d308f8e1639fab988df18a8011f41eacad73": { address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73", symbol: "WETH", name: "WETH", decimals: 18 },
    "0x40858070814a57fdf33a613ae84fe0a8b4a874f7": { address: "0x40858070814a57fdf33a613ae84fe0a8b4a874f7", symbol: "SYRUPUSDG", name: "syrupUSDG", decimals: 6 },
    "0xc72b96e0e48ecd4dc75e1e45396e26300bc39681": { address: "0xc72b96e0e48ecd4dc75e1e45396e26300bc39681", symbol: "INTC", name: "Intel • Robinhood Token", decimals: 18 },
    "0xe93237c50d904957cf27e7b1133b510c669c2e74": { address: "0xe93237c50d904957cf27e7b1133b510c669c2e74", symbol: "MSFT", name: "Microsoft • Robinhood Token", decimals: 18 },
    "0x117cc2133c37b721f49de2a7a74833232b3b4c0c": { address: "0x117cc2133c37b721f49de2a7a74833232b3b4c0c", symbol: "SPY", name: "SPDR S&P 500 ETF Trust • Robinhood Token", decimals: 18 },
    "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2": { address: "0x4ea005168d7f09a7a0ba9d1def21a479950e44c2", symbol: "COST", name: "Costco • Robinhood Token", decimals: 18 },
    "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec": { address: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", symbol: "NVDA", name: "NVIDIA • Robinhood Token", decimals: 18 },
    "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9": { address: "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9", symbol: "AAPL", name: "Apple • Robinhood Token", decimals: 18 },
    "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3": { address: "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3", symbol: "GOOGL", name: "Alphabet Class A • Robinhood Token", decimals: 18 },
    "0x322f0929c4625ed5bad873c95208d54e1c003b2d": { address: "0x322f0929c4625ed5bad873c95208d54e1c003b2d", symbol: "TSLA", name: "Tesla • Robinhood Token", decimals: 18 },
    "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68": { address: "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68", symbol: "QQQ", name: "Invesco QQQ • Robinhood Token", decimals: 18 },
    "0x12f190a9f9d7d37a250758b26824b97ce941bf54": { address: "0x12f190a9f9d7d37a250758b26824b97ce941bf54", symbol: "AMZN", name: "Amazon • Robinhood Token", decimals: 18 },
    "0xc0d6457c16cc70d6790dd43521c899c87ce02f35": { address: "0xc0d6457c16cc70d6790dd43521c899c87ce02f35", symbol: "META", name: "Meta Platforms • Robinhood Token", decimals: 18 },
    "0x6330d8c3178a418788df01a47479c0ce7ccf450b": { address: "0x6330d8c3178a418788df01a47479c0ce7ccf450b", symbol: "COIN", name: "Coinbase • Robinhood Token", decimals: 18 },
    "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a": { address: "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a", symbol: "PLTR", name: "Palantir Technologies • Robinhood Token", decimals: 18 },
    "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc": { address: "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc", symbol: "AMD", name: "AMD • Robinhood Token", decimals: 18 },
    "0x58ffe4a942d3885baa22d7520691f611ef09e7aa": { address: "0x58ffe4a942d3885baa22d7520691f611ef09e7aa", symbol: "TSM", name: "Taiwan Semiconductor Manufacturing • Robinhood Token", decimals: 18 },
    "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e": { address: "0xc9a981fee1f9dec688bb123ccdecc63d0debfc4e", symbol: "GLD", name: "SPDR Gold Shares • Robinhood Token", decimals: 18 },
    "0x92fd66527192e3e61d4ddd13322aa222de86f9b5": { address: "0x92fd66527192e3e61d4ddd13322aa222de86f9b5", symbol: "SGOV", name: "iShares 0-3 Month Treasury Bond ETF • Robinhood Token", decimals: 18 },
    "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea": { address: "0x4a0e65a3eccec6dbe60ae065f2e7bb85fae35eea", symbol: "SPCX", name: "Space Exploration Technologies Corp • Robinhood Token", decimals: 18 },
  },
  base: {
    "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", name: "USDC", decimals: 6 },
    "0x820c137fa70c8691f0e44dc420a5e53c168921dc": { address: "0x820c137fa70c8691f0e44dc420a5e53c168921dc", symbol: "USDS", name: "USDS", decimals: 18 },
    "0x0555e30da8f98308edb960aa94c0db47230d2b9c": { address: "0x0555e30da8f98308edb960aa94c0db47230d2b9c", symbol: "WBTC", name: "Wrapped Bitcoin", decimals: 8 },
    "0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196": { address: "0x88fb150bdc53a65fe94dea0c9ba0a6daf8c6e196", symbol: "LINK", name: "Chainlink", decimals: 18 },
    "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf": { address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", symbol: "CBBTC", name: "Coinbase Wrapped BTC", decimals: 8 },
    "0x4200000000000000000000000000000000000006": { address: "0x4200000000000000000000000000000000000006", symbol: "WETH", name: "Wrapped Ether", decimals: 18 },
    "0x50c5725949a6f0c72e6c4a641f24049a917db0cb": { address: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", symbol: "DAI", name: "Dai Stablecoin", decimals: 18 },
    "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2": { address: "0xfde4c96c8593536e31f229ea8f37b2ada2699bb2", symbol: "USDT", name: "Tether USD", decimals: 6 },
  },
  bsc: {
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d": { address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d", symbol: "USDC", name: "USD Coin", decimals: 18 },
    "0x55d398326f99059ff775485246999027b3197955": { address: "0x55d398326f99059ff775485246999027b3197955", symbol: "USDT", name: "Tether USD", decimals: 18 },
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c": { address: "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c", symbol: "WBNB", name: "Wrapped BNB", decimals: 18 },
    "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c": { address: "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c", symbol: "BTCB", name: "BTCB Token", decimals: 18 },
    "0x2170ed0880ac9a755fd29b2688956bd959f933f8": { address: "0x2170ed0880ac9a755fd29b2688956bd959f933f8", symbol: "ETH", name: "Ethereum Token", decimals: 18 },
    "0xe9e7cea3dedca5984780bafc599bd69add087d56": { address: "0xe9e7cea3dedca5984780bafc599bd69add087d56", symbol: "BUSD", name: "BUSD Token", decimals: 18 },
  },
  ink: {
    "0x2d270e6886d130d724215a266106e6832161eaed": { address: "0x2d270e6886d130d724215a266106e6832161eaed", symbol: "USDC", name: "USDC", decimals: 6 },
    "0x71052bae71c25c78e37fd12e5ff1101a71d9018f": { address: "0x71052bae71c25c78e37fd12e5ff1101a71d9018f", symbol: "LINK", name: "Chainlink", decimals: 18 },
    "0xe343167631d89b6ffc58b88d6b7fb0228795491d": { address: "0xe343167631d89b6ffc58b88d6b7fb0228795491d", symbol: "USDG", name: "Global Dollar", decimals: 6 },
    "0x0200c29006150606b650577bbe7b6248f58470c1": { address: "0x0200c29006150606b650577bbe7b6248f58470c1", symbol: "USD₮0", name: "USDT0", decimals: 6 },
  },
  hyperevm: {
    "0x25b5a1c25e3421e053d13f4645af3298c96138ef": { address: "0x25b5a1c25e3421e053d13f4645af3298c96138ef", symbol: "USDC", name: "USDC", decimals: 6 },
    "0x71a2017296de30f4597b36fbd90b7e8ec6e97a82": { address: "0x71a2017296de30f4597b36fbd90b7e8ec6e97a82", symbol: "BTC", name: "Bitcoin", decimals: 8 },
  }
};
