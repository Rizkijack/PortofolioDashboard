/**
 * lib/oracle/chainlink-feeds.ts — AUTO-GENERATED dari registry resmi Chainlink.
 * JANGAN edit manual. Sumber: reference-data-directory.vercel.app/feeds-{slug}.json
 * Digest: 2026-09-12 (276 feed: Robinhood 57, HyperEVM 36, BSC 174, Base 8 manual+verified)
 */

import type { ChainKey } from "../types";

export interface ChainlinkFeed {
  pair: string;
  address: string;
  heartbeatSec: number;
  declaredDecimals: number;
}

export const ROBINHOOD_FEEDS: ChainlinkFeed[] = [
  { pair: "SGOV / USD", address: "0xa0DF4ee0fFf975306345875E3548Fcc519577A11", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "EWY / USD", address: "0xEFdf54610B62A7753Ec30bDc380847c12D32e1D1", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "GOOGL / USD", address: "0xF6f373a037c30F0e5010d854385cA89185AE638b", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "BTC.B / USD", address: "0x5BB5e6a17a477d5B6Fec77b4322daD4A66bFb732", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "QQQ / USD", address: "0x80901d846d5D7B030F26B480776EE3b29374C2ae", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "TSM / USD", address: "0x874cF94aa8eC88Fd9560094dD065f2fB3E41Fc2F", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "WEETH / USD", address: "0xf882e1D50352aecB0Ac85378378918BCf40511e7", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "COIN / USD", address: "0xA3a468A452940B7D6b69991207B508c609a98Ef2", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "PLTR / USD", address: "0x820ABedFF239034956B7A9d2F0a331f9F075eB4c", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "LINK / USD", address: "0xe86e3422Aa9B5e8ee9f3E41a63975bC387A8bce9", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "RGTI / USD", address: "0x2A045cF1C49c61c166C036d2f06FA2D2d984f765", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "USDS / USD", address: "0x2D88D75b625633dCcd65d9d53BfDD3Aea2d8e84f", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "ORCL / USD", address: "0x0e6a64a2B58A6693a531E6c555f3A5d042eEA844", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "MSTR / USD", address: "0x396118bdFB181e6240E74D243F266B061c0edc3D", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "USDT / USD", address: "0xbf3550B6fAe1671da7C238Af12e03Ac586BEf3B1", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "RKLB / USD", address: "0x045477BF65Aef6f4F2386ad0164579e48381CC74", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "SPCX / USD", address: "0xB265810950ba6c5C0Ff821c9963014a56fD8Bffb", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "ETH / USD", address: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "SYRUPUSDC / USDC", address: "0x6317f016FA3e312C4625dee51d32b43a223011f8", heartbeatSec: 86400, declaredDecimals: 18 },
  { pair: "EURC / USD", address: "0xfF2B10c1973eD10c841434f98e456d8f3a0D7DD8", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "USAR / USD", address: "0xA994d3684e8400A6c8078226925779FdeE682DD9", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "SPY / USD", address: "0x319724394D3A0e3669269846abE664Cd621f9f6A", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "TSLA / USD", address: "0x4A1166a659A55625345e9515b32adECea5547C38", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "SNDK / USD", address: "0xfb133Fa4B7b385802B693a293606682Df47109A3", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "ENA / USD", address: "0x2A291496b3aa19d8948e442Ef28Ee952f3Ee97E8", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "IONQ / USD", address: "0x22EfeC4919baf55F360E0EDee4AbEB26DE4971eb", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "USDG / USD", address: "0x61B7e5650328764B076A108EFF5fa7282a1B9aD2", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "CRCL / USD", address: "0x6652eDf64bA3731C4F2D3ce821A0Fb1f1f6b482a", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "AMZN / USD", address: "0xD5a1508ceD74c084eBf3cBe853e2C968fB2a651C", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "WSTETH / USD", address: "0x3F5040B50FB37934573B210fE54B53a6F1A792E8", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "INTC / USD", address: "0x3f390C5C24628Ac7C489515402235FeAD71D1913", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "WBTC / USD", address: "0x62107b0d3adA75fc1697fD342d99eed947a3aA5E", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "MU / USD", address: "0x425EEFdCf05ed6526C3cE61Af99429A228a6d596", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "AAPL / USD", address: "0x6B22A786bAa607d76728168703a39Ea9C99f2cD0", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "SYRUPUSDT / USDT", address: "0xBB688c0184Ce03fEdac89D71ccE752Ab21bC2999", heartbeatSec: 86400, declaredDecimals: 18 },
  { pair: "NVDA / USD", address: "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "LBTC / USD", address: "0xa621344AdAEE699491597Fd8890E0C59a5BFBE59", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "DELL / USD", address: "0x1C6c8cADBe02E19129c39dDB92281cE4c0bf206b", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "syrupUSDG / USDG", address: "0xDd194C66aDcb422F188a04434e4824D70c151cF0", heartbeatSec: 86400, declaredDecimals: 18 },
  { pair: "USDC / USD", address: "0x9e6f4605992a899eE2999999F3Ec80C41F452546", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "NBIS / USD", address: "0xE1D87B116Ba0fe898998f1D140339D1fA1E09705", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "WEETH / EETH", address: "0xb63f44E40aA811Cc69Fc55da786a5F3834100B4A", heartbeatSec: 86400, declaredDecimals: 18 },
  { pair: "CLSK / USD", address: "0x810c12D3a554Bc47fd39597Fe3b3AAC4941F50eF", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "ASML / USD", address: "0xB4106147E8cce40b7d46124090d373A71b70f87D", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "CBBTC / USD", address: "0x0009cD492adf8167f9eEBf1293556A673530a21a", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "BABA / USD", address: "0x62Cc8F9b5f56a33c9C8A60c8B92779f523c4E984", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "USO / USD", address: "0x75a9c76Ef439e2C7c2E5a34Ab105EcFe3766431c", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "SYRUPUSDC / USD", address: "0x8765c3B9Cda41d1029E780D0c1C37C8200DC4675", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "META / USD", address: "0x7C38C00C30BEe9378381E7B6135d7283356D71b1", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "MSFT / USD", address: "0x45C3C877C15E6BA2EBB19eA114Ea508d14C1Af2E", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "BTC / USD", address: "0xa2c5184bF03d373Dc9dE4876eb4Bce595B460251", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "SLV / USD", address: "0x209b73908e92Ae021826eD79609845451Ecba2ce", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "CRWV / USD", address: "0xe1b3aABCAFAd1c94708dc1367dcfF8Aa4407487C", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "AMD / USD", address: "0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "GME / USD", address: "0x27C71df6A64fB476468EdF256CF72c038baB5B67", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "WSTETH / STETH", address: "0x8E3Eb706B170c8FD1DdcD402932D952887736f9A", heartbeatSec: 86400, declaredDecimals: 18 },
  { pair: "USDE / USD", address: "0xb9fB4e65744E4178894f7C61CF80E8a48A5f224a", heartbeatSec: 86400, declaredDecimals: 8 },
];

export const HYPEREVM_FEEDS: ChainlinkFeed[] = [
  { pair: "BEHYPE / HYPE", address: "0xcAED794504b747629BE4E96463D61DF7B62D52be", heartbeatSec: 86400, declaredDecimals: 18 },
  { pair: "THBILL / USD", address: "0x30b0970f2FD7dc67A135c80EbE5aC3778D65003E", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "BTC / USD", address: "0x71A2017296De30F4597B36FBD90b7e8Ec6E97A82", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "USDE / USD", address: "0xb52bD7011Bd12988E5B25561b975B2106A23a902", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "ETH / USD", address: "0x150c7f5f2A9F78f69aEBe7959c16f4e25FefDa7C", heartbeatSec: 86400, declaredDecimals: 18 },
  { pair: "KHYPE / USD", address: "0xe364373ce59F7689425e648D57036428087B5d93", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "WSTHYPE / STHYPE", address: "0x693B36686C9296b45789b74De588B7fdF4d3257c", heartbeatSec: 86400, declaredDecimals: 18 },
  { pair: "WHLP / USDT0", address: "0xeCD520e9076025EA40cd0425645ed29fd73eC330", heartbeatSec: 86400, declaredDecimals: 18 },
  { pair: "HYPE / USD", address: "0x2b25BC41D55de29F3A2e163F8Eebf63966B25b57", heartbeatSec: 86400, declaredDecimals: 18 },
  { pair: "USDC / USD", address: "0x25B5A1c25E3421E053D13F4645AF3298c96138eF", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "BEHYPE / HYPE", address: "0x52085f65792286d2cA1B8C2Dc5A87F635cd90E00", heartbeatSec: 86400, declaredDecimals: 18 },
  { pair: "KHYPE / HYPE", address: "0x8C96a399754D36C90a9b5d648a746Da616072280", heartbeatSec: 86400, declaredDecimals: 18 },
];

export const BASE_FEEDS: ChainlinkFeed[] = [
  { pair: "ETH / USD", address: "0x71041dddad3595F9CEd3DcCFBe3D1F4b0a16Bb70", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "BTC / USD", address: "0x64c911996D3c6aC71f9b455B1E8E7266BcbD848F", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "USDC / USD", address: "0x7e860098F58bBFC8648a4311b374B1D669a2bc6B", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "USDT / USD", address: "0xf19d560eB8d2ADf07BD6D13ed03e1D11215721F9", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "DAI / USD", address: "0x591e79239a7d679378ec8c847e5038150364c78f", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "LINK / USD", address: "0x17CAb8FE31E32f08326e5E27412894e49B0f9D65", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "SOL / USD", address: "0x975043adBb80fc32276CbF9Bbcfd4A601a12462D", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "cbETH / ETH", address: "0x806b4Ac04501c29769051e42783cF04dCE41440b", heartbeatSec: 86400, declaredDecimals: 18 },
];

export const BSC_FEEDS: ChainlinkFeed[] = [
  { pair: "BNB / USD", address: "0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "ETH / USD", address: "0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "BTC / USD", address: "0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "USDT / USD", address: "0xB97Ad0E74fa7d920791E90258A6E2085088b4320", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "USDC / USD", address: "0x51597f405303C4377E36123cBc172b13269EA163", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "BUSD / USD", address: "0xcBb98864Ef56E9042e7d2efef76141f15731B82f", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "LINK / USD", address: "0xca236E327F629f9Fc2c30A4E95775EbF0B89fac8", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "XRP / USD", address: "0x93A67D414896A280bF8FFB3b389FE3686eAb8f3c", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "DOGE / USD", address: "0x3AB0A0d137D4F946fBB19eecc6e92E64660231C8", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "ADA / USD", address: "0xa767f745331D267c7751297D982b050c93985627", heartbeatSec: 86400, declaredDecimals: 8 },
  { pair: "SOL / USD", address: "0x0E8a53DD9c13589df6382F13dA6B3Ec8F919B323", heartbeatSec: 86400, declaredDecimals: 8 },
];

export const INK_FEEDS: ChainlinkFeed[] = [];

export const CHAINLINK_FEEDS: Record<ChainKey, ChainlinkFeed[]> = {
  robinhood: ROBINHOOD_FEEDS,
  base: BASE_FEEDS,
  bsc: BSC_FEEDS,
  hyperevm: HYPEREVM_FEEDS,
  ink: INK_FEEDS,
};

/** Cari feed berdasarkan simbol aset (ETH, HYPE, NVDA, …). */
export function findFeed(chain: ChainKey, symbol: string): ChainlinkFeed | undefined {
  const up = symbol.toUpperCase();
  const list = CHAINLINK_FEEDS[chain] ?? [];
  return (
    list.find((f) => f.pair.toUpperCase() === `${up} / USD`) ??
    list.find((f) => f.pair.toUpperCase().startsWith(`${up} / USD`)) ??
    list.find((f) => f.pair.toUpperCase().startsWith(`${up} `))
  );
}
