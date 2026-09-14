/**
 * lib/asset-allocation.test.ts — unit test klasifikasi & agregasi.
 *
 * Jalankan: `bun test` (runner bawaan Bun, tanpa dependency tambahan).
 * Kasus mencakup regresi dari code review: prefix LP longgar, LST ETH,
 * canonical symbol ambigu, nilai null, dan agregasi simbol duplikat.
 */
import { describe, expect, test } from "bun:test";
import { classifyPosition, buildAllocationBreakdown } from "./asset-allocation";
import type { PortfolioPosition } from "./compat";

function pos(symbol: string, opts: Partial<PortfolioPosition> = {}): PortfolioPosition {
  return {
    chainId: 1,
    chainKey: "base",
    token: { address: "0x" + "0".repeat(40), symbol, name: symbol, decimals: 18, chainId: 1, logo: null },
    rawBalance: "0",
    balance: "0",
    formatted: 0,
    priceUsd: 1,
    valueUsd: 100,
    change24h: 0,
    priceSource: "none",
    priceAgeMs: 0,
    priceStale: false,
    isNative: false,
    suspicious: false,
    protocol: null,
    ...opts,
  };
}

describe("classifyPosition", () => {
  test("LST/wrapped ETH → major (bukan defi)", () => {
    expect(classifyPosition(pos("STETH"))).toBe("major");
    expect(classifyPosition(pos("wstETH"))).toBe("major");
    expect(classifyPosition(pos("cbETH"))).toBe("major");
    expect(classifyPosition(pos("WEETH"))).toBe("major");
    expect(classifyPosition(pos("RETH"))).toBe("major");
  });

  test("prefix longgar tidak menelan ticker umum → ecosystem", () => {
    expect(classifyPosition(pos("STONE"))).toBe("ecosystem");
    expect(classifyPosition(pos("STG"))).toBe("ecosystem");
    expect(classifyPosition(pos("STRK"))).toBe("ecosystem");
    expect(classifyPosition(pos("VET"))).toBe("ecosystem");
    expect(classifyPosition(pos("CAKE"))).toBe("ecosystem");
    expect(classifyPosition(pos("UNI"))).toBe("ecosystem");
    expect(classifyPosition(pos("INTC"))).toBe("ecosystem");
  });

  test("LP & pool → defi", () => {
    expect(classifyPosition(pos("UNI-CAKE LP"))).toBe("defi");
    expect(classifyPosition(pos("CAKE-WBNB LP"))).toBe("defi");
    expect(classifyPosition(pos("WETH/USDC"))).toBe("defi");
    expect(classifyPosition(pos("USDC/ETH LP"))).toBe("defi");
    expect(classifyPosition(pos("vAMM-USDC"))).toBe("defi");
    expect(classifyPosition(pos("ANY", { protocol: "uniswap-v3" }))).toBe("defi");
  });

  test("stablecoin & canonical ambigu", () => {
    expect(classifyPosition(pos("USDC"))).toBe("stable");
    expect(classifyPosition(pos("USDT"))).toBe("stable");
    expect(classifyPosition(pos("USDS"))).toBe("stable");
    expect(classifyPosition(pos("SUSDE"))).toBe("stable");
    // "U" = United Stables via canonical Robinhood (address asli).
    const u = pos("U", {
      chainKey: "robinhood",
      token: { address: "0xce24439f2d9c6a2289f741120fe202248b666666", symbol: "U", name: "United Stables", decimals: 18, chainId: 4663, logo: null },
    });
    expect(classifyPosition(u)).toBe("stable");
    expect(classifyPosition(pos("USD₮0"))).toBe("stable");
  });

  test("token native selalu major", () => {
    expect(classifyPosition(pos("ETH", { isNative: true }))).toBe("major");
    expect(classifyPosition(pos("BNB", { isNative: true }))).toBe("major");
    expect(classifyPosition(pos("HYPE", { isNative: true }))).toBe("major");
  });
});

describe("buildAllocationBreakdown", () => {
  test("semua posisi tanpa harga → total 0, tanpa klaim palsu", () => {
    const b = buildAllocationBreakdown([pos("AAA", { valueUsd: null }), pos("BBB", { valueUsd: null })]);
    expect(b.totalUsd).toBe(0);
    expect(b.unclassifiedCount).toBe(2);
    expect(b.risk.defensivePct).toBe(0);
    expect(b.risk.score).toBe(0);
    for (const s of b.slices) expect(s.pct).toBe(0);
  });

  test("simbol duplikat lintas posisi teragregasi di topSymbols", () => {
    const b = buildAllocationBreakdown([
      pos("USDC", { valueUsd: 100 }),
      pos("USDC", { valueUsd: 100 }),
      pos("ETH", { valueUsd: 150, isNative: true }),
    ]);
    const stable = b.slices.find((s) => s.category === "stable")!;
    expect(stable.valueUsd).toBe(200);
    expect(stable.topSymbols).toEqual(["USDC"]);
    expect(b.totalUsd).toBe(350);
  });

  test("skor risiko transparan: 50% stable + 50% ecosystem → balanced 50", () => {
    const b = buildAllocationBreakdown([pos("USDC", { valueUsd: 100 }), pos("MEME", { valueUsd: 100 })]);
    expect(b.risk.defensivePct).toBeCloseTo(50, 5);
    expect(b.risk.volatilePct).toBeCloseTo(50, 5);
    expect(b.risk.score).toBe(50);
    expect(b.risk.verdict).toBe("balanced");
  });
});
