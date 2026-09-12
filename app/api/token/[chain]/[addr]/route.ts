import { NextRequest, NextResponse } from "next/server";
import { parseAbi } from "viem";
import { chainByKey, isAddress } from "@/lib/chains";
import { fetchTokenMeta } from "@/lib/discovery";
import { resolveQuotes, fillFromDexScreener } from "@/lib/oracle";
import { fetchOhlcv, fetchPairs, overviewOf } from "@/lib/oracle/dexscreener";
import { withFailover } from "@/lib/rpc";
import { rawToDecimalString } from "@/lib/format";
import { NATIVE_ADDRESS, type PriceQuote, type TokenBalance, type TokenDetailResponse } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ERC20_META = parseAbi([
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);

export async function GET(req: NextRequest, ctx: { params: Promise<{ chain: string; addr: string }> }) {
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
  const totalSupply: string | null = null;
  let circulatingMarketCap: number | null = null;
  let volume24h: number | null = null;
  let logoUrl: string | null = null;

  if (!isNative) {
    const onchain = await withFailover(meta.key, async (client) => {
      const [sym, nm, dec] = await Promise.all([
        client.readContract({ address: addr as `0x${string}`, abi: ERC20_META, functionName: "symbol" }),
        client.readContract({ address: addr as `0x${string}`, abi: ERC20_META, functionName: "name" }),
        client.readContract({ address: addr as `0x${string}`, abi: ERC20_META, functionName: "decimals" }),
      ]);
      return { sym, nm, dec };
    }).catch((e) => {
      warnings.push(`onchain meta: ${e instanceof Error ? e.message.slice(0, 120) : "failed"}`);
      return null;
    });

    if (onchain) {
      symbol = String(onchain.value.sym);
      name = String(onchain.value.nm);
      decimals = Number(onchain.value.dec);
    }

    const explorerMeta = await fetchTokenMeta(meta.key, addr);
    if (explorerMeta) {
      symbol = explorerMeta.symbol?.trim() || symbol;
      name = explorerMeta.name?.trim() || name;
      holdersCount = explorerMeta.holdersCount ?? null;
      circulatingMarketCap = explorerMeta.marketCapUsd ?? null;
      volume24h = explorerMeta.volume24hUsd ?? null;
      logoUrl = explorerMeta.logoUrl ?? null;
      if (!onchain && explorerMeta.decimals) decimals = explorerMeta.decimals;
    } else {
      warnings.push("explorer metadata unavailable");
    }
  }

  const quoteMap = await resolveQuotes(meta.key, [{ address: addr, symbol, isNative }]).catch(
    () => new Map<string, PriceQuote>()
  );
  if (!isNative) {
    await fillFromDexScreener(meta.key, [{ address: addr, symbol }], quoteMap);
  }
  let price = quoteMap.get(addr.toLowerCase());

  const pairs = await fetchPairs(meta.key, [addr]).catch(() => new Map());
  const dexOverview = overviewOf(pairs.get(addr.toLowerCase()));
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

  circulatingMarketCap = circulatingMarketCap ?? dexOverview.marketCap ?? null;
  volume24h = volume24h ?? dexOverview.volume24h ?? null;

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

  let chart: TokenDetailResponse["chart"];
  if (chartTf) {
    const timeframe = chartTf === "1h" ? "minute" : chartTf === "7d" ? "day" : "hour";
    const aggregate = chartTf === "1h" ? 5 : 1;
    const pool = dexOverview.pairAddress;
    if (pool) {
      chart = await fetchOhlcv(meta.key, pool, timeframe as "minute" | "hour" | "day", aggregate);
      if (!chart.length) warnings.push("chart data unavailable");
    } else {
      warnings.push("no DEX pool found for chart");
    }
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

  const body: TokenDetailResponse = {
    token,
    meta: {
      holdersCount,
      totalSupply,
      circulatingMarketCap,
      volume24h,
      explorerUrl: isNative ? `${meta.explorer}/address/${addr}` : `${meta.explorer}/token/${addr}`,
      priceFeeds,
    },
    chart,
    warnings,
  };

  return NextResponse.json(body, {
    headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=15" },
  });
}
