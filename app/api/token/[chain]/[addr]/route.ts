import { NextRequest, NextResponse } from "next/server";
import { parseAbi } from "viem";
import { chainByKey, isAddress } from "@/lib/chains";
import { fetchTokenMeta } from "@/lib/discovery";
import { resolveQuotes, fillFromDexScreener } from "@/lib/oracle";
import { fetchOhlcv, fetchPairs, overviewOf } from "@/lib/oracle/dexscreener";
import { withFailover } from "@/lib/rpc";
import { rateLimit } from "@/lib/rate-limit";
import { rawToDecimalString } from "@/lib/format";
import { fetchWithTimeout, globalCache } from "@/lib/cache";
import { NATIVE_ADDRESS, type PriceQuote, type TokenBalance, type TokenDetailResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERC20_META = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

async function fetchGeckoTerminalToken(network: string, tokenAddress: string) {
  const key = `gt:token:${network}:${tokenAddress.toLowerCase()}`;
  try {
    const { value } = await globalCache.swr(
      key,
      async () => {
        const url = `https://api.geckoterminal.com/api/v2/networks/${network}/tokens/${tokenAddress}?include=top_pools`;
        const res = await fetchWithTimeout(url, {
          timeoutMs: 8000,
          headers: { accept: "application/json" },
        });
        if (!res.ok) return null;
        return (await res.json()) as {
          data?: {
            attributes?: {
              name?: string;
              symbol?: string;
              decimals?: number;
              total_supply?: string;
              price_usd?: string;
              fdv_usd?: string;
              total_reserve_in_usd?: string;
              volume_usd?: { h24?: string };
            };
            relationships?: {
              top_pools?: { data?: Array<{ id: string }> };
            };
          };
        };
      },
      { freshMs: 30_000, staleMs: 180_000 }
    );
    return value;
  } catch {
    return null;
  }
}

async function fetchBirdeyeTokenOverview(chain: string, tokenAddress: string) {
  const apiKey = process.env.BIRDEYE_API_KEY?.trim();
  if (!apiKey) return null;
  const key = `be:token:${chain}:${tokenAddress.toLowerCase()}`;
  try {
    const { value } = await globalCache.swr(
      key,
      async () => {
        const url = `https://public-api.birdeye.so/defi/token_overview?address=${tokenAddress}`;
        const res = await fetchWithTimeout(url, {
          timeoutMs: 8000,
          headers: {
            accept: "application/json",
            "X-API-KEY": apiKey,
            "x-chain": chain,
          },
        });
        if (!res.ok) return null;
        return (await res.json()) as {
          data?: {
            price?: number;
            liquidity?: number;
            v24hUSD?: number;
            mc?: number;
            holder?: number;
          };
        };
      },
      { freshMs: 30_000, staleMs: 180_000 }
    );
    return value?.data ?? null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ chain: string; addr: string }> }) {
  const rl = rateLimit(req);
  if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  const { chain: chainParam, addr } = await ctx.params;
  const meta = chainByKey(chainParam);
  if (!meta) return NextResponse.json({ error: "unknown chain" }, { status: 404 });
  if (!isAddress(addr)) return NextResponse.json({ error: "invalid token address" }, { status: 400 });

  const sp = req.nextUrl.searchParams;
  const owner = sp.get("owner");
  const chartTf = sp.get("chart");
  const warnings: string[] = [];

  const isNative = addr.toLowerCase() === NATIVE_ADDRESS.toLowerCase();

  let symbol = meta.nativeSymbol;
  let name = meta.name;
  let decimals = meta.nativeDecimals;
  let holdersCount: number | null = null;
  let totalSupply: string | null = null;
  let circulatingMarketCap: number | null = null;
  let volume24h: number | null = null;
  let liquidityUsd: number | null = null;
  let fdv: number | null = null;
  let logoUrl: string | null = null;

  if (!isNative) {
    const onchain = await withFailover(meta.key, async (client) => {
      const [sym, nm, dec, sup] = await Promise.all([
        client.readContract({ address: addr as `0x${string}`, abi: ERC20_META, functionName: "symbol" }).catch(() => null),
        client.readContract({ address: addr as `0x${string}`, abi: ERC20_META, functionName: "name" }).catch(() => null),
        client.readContract({ address: addr as `0x${string}`, abi: ERC20_META, functionName: "decimals" }).catch(() => null),
        client.readContract({ address: addr as `0x${string}`, abi: ERC20_META, functionName: "totalSupply" }).catch(() => null),
      ]);
      return { sym, nm, dec, sup };
    }).catch((e) => {
      warnings.push(`onchain meta: ${e instanceof Error ? e.message.slice(0, 120) : "failed"}`);
      return null;
    });

    if (onchain?.value) {
      if (onchain.value.sym) symbol = String(onchain.value.sym);
      if (onchain.value.nm) name = String(onchain.value.nm);
      if (onchain.value.dec !== null && onchain.value.dec !== undefined) decimals = Number(onchain.value.dec);
      if (onchain.value.sup !== null && onchain.value.sup !== undefined) {
        totalSupply = rawToDecimalString(onchain.value.sup.toString(), decimals);
      }
    }

    const explorerMeta = await fetchTokenMeta(meta.key, addr);
    if (explorerMeta) {
      symbol = explorerMeta.symbol?.trim() || symbol;
      name = explorerMeta.name?.trim() || name;
      holdersCount = explorerMeta.holdersCount ?? null;
      circulatingMarketCap = explorerMeta.marketCapUsd ?? null;
      volume24h = explorerMeta.volume24hUsd ?? null;
      logoUrl = explorerMeta.logoUrl ?? null;
      if (!onchain?.value && explorerMeta.decimals) decimals = explorerMeta.decimals;
    }
  }

  // M31 fix: paralelkan 3 sumber independen (sebelumnya serial 4 fetch)
  const [pairs, gtData, birdeyeOverview] = await Promise.all([
    fetchPairs(meta.key, [addr]).catch(() => new Map() as Awaited<ReturnType<typeof fetchPairs>>),
    fetchGeckoTerminalToken(meta.dexscreenerSlug, addr),
    fetchBirdeyeTokenOverview(meta.dexscreenerSlug, addr),
  ]);
  const dexOverview = overviewOf(pairs.get(addr.toLowerCase()));
  const pairItem = pairs.get(addr.toLowerCase());
  const gtAttr = gtData?.data?.attributes;
  const gtTopPoolId = gtData?.data?.relationships?.top_pools?.data?.[0]?.id;
  const gtPoolAddr = gtTopPoolId ? gtTopPoolId.split("_").pop() || null : null;

  // Aggregate Metrics across providers
  circulatingMarketCap =
    circulatingMarketCap ??
    dexOverview.marketCap ??
    birdeyeOverview?.mc ??
    (gtAttr?.fdv_usd ? parseFloat(gtAttr.fdv_usd) : null);

  volume24h =
    volume24h ??
    dexOverview.volume24h ??
    birdeyeOverview?.v24hUSD ??
    (gtAttr?.volume_usd?.h24 ? parseFloat(gtAttr.volume_usd.h24) : null);

  liquidityUsd =
    dexOverview.liquidityUsd ??
    birdeyeOverview?.liquidity ??
    (gtAttr?.total_reserve_in_usd ? parseFloat(gtAttr.total_reserve_in_usd) : null);

  fdv = dexOverview.fdv ?? (gtAttr?.fdv_usd ? parseFloat(gtAttr.fdv_usd) : null);

  if (birdeyeOverview?.holder && !holdersCount) {
    holdersCount = birdeyeOverview.holder;
  }

  // Oracle Price Resolution
  const quoteMap = await resolveQuotes(meta.key, [{ address: addr, symbol, isNative }]).catch(
    () => new Map<string, PriceQuote>()
  );
  if (!isNative) {
    await fillFromDexScreener(meta.key, [{ address: addr, symbol }], quoteMap);
  }
  let price = quoteMap.get(addr.toLowerCase());

  if ((!price || price.usd === null) && dexOverview.priceUsd !== null) {
    price = {
      usd: dexOverview.priceUsd,
      source: "dexscreener",
      updatedAt: Date.now(),
      fetchedAt: Date.now(),
      ageMs: 0,
      stale: false,
      change24h: dexOverview.change24h,
    };
  } else if ((!price || price.usd === null) && gtAttr?.price_usd) {
    const p = parseFloat(gtAttr.price_usd);
    if (Number.isFinite(p) && p > 0) {
      price = {
        usd: p,
        source: "geckoterminal",
        updatedAt: Date.now(),
        fetchedAt: Date.now(),
        ageMs: 0,
        stale: false,
        change24h: null,
      };
    }
  }

  if (!price) {
    price = {
      usd: null,
      source: "none",
      updatedAt: 0,
      fetchedAt: Date.now(),
      ageMs: 0,
      stale: true,
      change24h: null,
    };
  }

  // User Token Balance (if owner provided) — 400 jika owner invalid tapi param ada
  if (owner && !isAddress(owner)) {
    return NextResponse.json({ error: "invalid owner address" }, { status: 400 });
  }
  let token: TokenBalance | null = null;
  if (isAddress(owner)) {
    try {
      const raw = await withFailover(meta.key, (client) =>
        isNative
          ? client.getBalance({ address: owner })
          : client.readContract({
              address: addr as `0x${string}`,
              abi: ERC20_META,
              functionName: "balanceOf",
              args: [owner],
            })
      );
      const balance = rawToDecimalString(raw.value.toString(), decimals);
      const valueUsd = price.usd === null ? null : Number(balance) * price.usd;
      token = {
        chain: meta.key,
        address: addr,
        addressLower: addr.toLowerCase(),
        symbol,
        name,
        decimals,
        rawBalance: raw.value.toString(),
        balance,
        isNative,
        logoUrl,
        price,
        valueUsd: valueUsd !== null && Number.isFinite(valueUsd) ? valueUsd : null,
      };
    } catch (e) {
      warnings.push(`balance: ${e instanceof Error ? e.message.slice(0, 120) : "failed"}`);
    }
  }

  // OHLCV Candlestick Chart Data
  let chart: TokenDetailResponse["chart"] = [];
  const poolForChart = dexOverview.pairAddress || gtPoolAddr;
  if (poolForChart) {
    const requestedTf = chartTf || "24h";
    const timeframe = requestedTf === "1h" ? "minute" : requestedTf === "7d" ? "day" : "hour";
    const aggregate = requestedTf === "1h" ? 5 : 1;
    chart = await fetchOhlcv(meta.key, poolForChart, timeframe as "minute" | "hour" | "day", aggregate);
  }

  const priceFeeds: TokenDetailResponse["meta"]["priceFeeds"] = [];
  if (price.source !== "none") priceFeeds.push({ source: price.source, label: `${symbol}/USD` });
  if (dexOverview.pairAddress) {
    priceFeeds.push({
      source: "dexscreener",
      address: dexOverview.pairAddress,
      label: `${dexOverview.dexId ?? "dex"} pool`,
    });
  }
  if (gtPoolAddr) {
    priceFeeds.push({
      source: "geckoterminal",
      address: gtPoolAddr,
      label: "geckoterminal pool",
    });
  }

  // URLs
  const explorerUrl = isNative ? `${meta.explorer}/address/${addr}` : `${meta.explorer}/token/${addr}`;
  const dexscreenerUrl = pairItem?.url || `https://dexscreener.com/${meta.dexscreenerSlug}/${addr}`;
  const geckoterminalUrl = `https://www.geckoterminal.com/${meta.dexscreenerSlug}/tokens/${addr}`;
  const birdeyeUrl = `https://birdeye.so/token/${addr}?chain=${meta.dexscreenerSlug}`;

  const body: TokenDetailResponse = {
    token,
    meta: {
      holdersCount,
      totalSupply,
      circulatingMarketCap,
      volume24h,
      liquidityUsd,
      fdv,
      explorerUrl,
      dexscreenerUrl,
      geckoterminalUrl,
      birdeyeUrl,
      priceFeeds,
      dexscreener: dexOverview.pairAddress
        ? {
            pairAddress: dexOverview.pairAddress,
            dexId: dexOverview.dexId,
            priceUsd: dexOverview.priceUsd,
            liquidityUsd: dexOverview.liquidityUsd,
            fdv: dexOverview.fdv,
            marketCap: dexOverview.marketCap,
            volume24h: dexOverview.volume24h,
            change24h: dexOverview.change24h,
            url: pairItem?.url ?? dexscreenerUrl,
          }
        : null,
      geckoterminal: gtPoolAddr
        ? {
            poolAddress: gtPoolAddr,
            dexId: null,
            reserveUsd: gtAttr?.total_reserve_in_usd ? parseFloat(gtAttr.total_reserve_in_usd) : null,
            fdvUsd: gtAttr?.fdv_usd ? parseFloat(gtAttr.fdv_usd) : null,
            url: geckoterminalUrl,
          }
        : null,
      birdeye: birdeyeOverview
        ? {
            priceUsd: birdeyeOverview.price ?? null,
            liquidityUsd: birdeyeOverview.liquidity ?? null,
            volume24h: birdeyeOverview.v24hUSD ?? null,
            url: birdeyeUrl,
          }
        : null,
    },
    chart: chart && chart.length > 0 ? chart : undefined,
    warnings,
  };

  // jika ada owner (per-address), private; else public
  const cacheCtrl = owner ? "private, max-age=5, stale-while-revalidate=15" : "public, s-maxage=5, stale-while-revalidate=15";
  return NextResponse.json(body, { headers: { "Cache-Control": cacheCtrl } });
}
