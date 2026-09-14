"use client";

import { useMemo } from "react";
import { buildAllocationBreakdown, type AllocationBreakdown, type AssetCategory } from "@/lib/asset-allocation";
import { cn, fmtUsd } from "@/lib/utils";
import type { PortfolioSummary } from "@/lib/compat";

/** Meta tampilan per kategori — warna konsisten light & dark. */
const CATEGORY_META: Record<AssetCategory, { dotClass: string; strokeClass: string; barClass: string }> = {
  stable: {
    dotClass: "bg-emerald-500",
    strokeClass: "stroke-emerald-500",
    barClass: "bg-emerald-500",
  },
  major: {
    // Kontras penuh di kedua mode (hitam di light, putih di dark).
    dotClass: "bg-zinc-900 dark:bg-zinc-100",
    strokeClass: "stroke-zinc-900 dark:stroke-zinc-100",
    barClass: "bg-zinc-900 dark:bg-zinc-100",
  },
  defi: {
    dotClass: "bg-violet-500",
    strokeClass: "stroke-violet-500",
    barClass: "bg-violet-500",
  },
  ecosystem: {
    dotClass: "bg-amber-500",
    strokeClass: "stroke-amber-500",
    barClass: "bg-amber-500",
  },
};

// Geometri donut SVG murni (tanpa library).
const DONUT_R = 52;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;
// Slice < 2% tetap digambar dengan busur minimal 0.5% keliling. Bleed ≤0.5%
// hanya mungkin terlihat pada slice TERAKHIR — slice sebelumnya tertutup oleh
// slice berikutnya yang digambar di atasnya (urutan SVG menang).
const MIN_SEG = 0.005 * DONUT_CIRC;

/** Satu kalimat insight statis berbasis verdict untuk keputusan rebalancing. */
const VERDICT_INSIGHT: Record<AllocationBreakdown["risk"]["verdict"], string> = {
  defensive: "Mayoritas aset stabil — low volatility exposure.",
  balanced: "Campuran stabil & volatil relatif seimbang — pantau porsi volatil berkala.",
  aggressive: "Porsi aset volatil tinggi — pertimbangkan rebalancing ke stable/major.",
};

const VERDICT_CHIP: Record<AllocationBreakdown["risk"]["verdict"], string> = {
  defensive: "bg-emerald-500 text-white",
  balanced: "bg-amber-500 text-white",
  aggressive: "bg-red-500 text-white",
};

/** Donut SVG murni — stroke-dasharray per slice, mulai dari jam 12 (rotate -90°). */
function Donut({ breakdown }: { breakdown: AllocationBreakdown }) {
  const totalUsd = breakdown.totalUsd;

  const validSlices = breakdown.slices.filter((s) => s.pct > 0);
  const segments = validSlices.reduce<
    Array<{ key: string; className: string; len: number; offset: number; rawAccum: number }>
  >((acc, s) => {
    const frac = s.pct / 100;
    const len = Math.max(frac * DONUT_CIRC, MIN_SEG);
    const prevAccum = acc.length > 0 ? acc[acc.length - 1].rawAccum : 0;
    const rawAccum = prevAccum + frac * DONUT_CIRC;
    acc.push({
      key: s.category,
      className: CATEGORY_META[s.category].strokeClass,
      len,
      offset: -prevAccum,
      rawAccum,
    });
    return acc;
  }, []);

  const ariaLabel =
    "Komposisi aset: " +
    breakdown.slices
      .filter((s) => s.pct > 0)
      .map((s) => `${s.label} ${s.pct.toFixed(1)}%`)
      .join(", ") +
    `. Total ${fmtUsd(totalUsd, { compact: true })}.`;

  return (
    <div className="relative h-[140px] w-[140px] shrink-0">
      <svg viewBox="0 0 140 140" className="h-full w-full" role="img" aria-label={ariaLabel}>
        {/* Track abu-abu untuk porsi yang tidak ada slice-nya */}
        <circle cx={70} cy={70} r={DONUT_R} fill="none" strokeWidth={16} className="stroke-zinc-100 dark:stroke-zinc-800" />
        <g transform="rotate(-90 70 70)">
          {segments.map((seg) => (
            <circle
              key={seg.key}
              cx={70}
              cy={70}
              r={DONUT_R}
              fill="none"
              strokeWidth={16}
              className={seg.className}
              strokeDasharray={`${seg.len} ${DONUT_CIRC - seg.len}`}
              strokeDashoffset={seg.offset}
            />
          ))}
        </g>
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-lg font-bold tracking-tight leading-none">{fmtUsd(totalUsd, { compact: true })}</p>
        <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-zinc-500">Total</p>
      </div>
    </div>
  );
}

/** Bento "Allocation • by asset class" — donut + segmented bar + legend + risiko. */
export function AssetAllocationBento({
  portfolio,
  loading,
  hasAddress,
}: {
  portfolio: PortfolioSummary | null;
  loading: boolean;
  hasAddress: boolean;
}) {
  // Komputasi murni sisi klien dari positions — 0 network request tambahan.
  const breakdown = useMemo(
    () => buildAllocationBreakdown(portfolio?.positions ?? []),
    [portfolio?.positions]
  );

  const { risk, slices, totalUsd } = breakdown;
  const hasData = Boolean(portfolio && portfolio.positions.length > 0);
  // Skor/bars risiko hanya bermakna bila ada posisi berharga — tanpa itu
  // tampil "—" (filosofi repo: null = tidak diketahui, bukan 0/karangan).
  const hasPricedValue = totalUsd > 0;

  const cardClass = "rounded-[24px] border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6";

  return (
    <div className={cardClass}>
      {/* Header — gaya sama dengan panel by-chain */}
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-sm font-bold uppercase tracking-widest">Allocation • by asset class</h2>
        <span className="text-xs text-zinc-500">
          {hasAddress ? (loading ? "Syncing…" : "Live") : "Belum ada wallet"} • {portfolio?.positions.length ?? 0} aset
        </span>
      </div>

      {/* Skeleton saat fetch pertama */}
      {loading && !portfolio ? (
        <div className="animate-pulse space-y-4">
          <div className="flex gap-6">
            <div className="h-[140px] w-[140px] rounded-full bg-zinc-100 dark:bg-zinc-800" />
            <div className="flex-1 space-y-3 py-2">
              <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded" />
              <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-5/6" />
              <div className="h-4 bg-zinc-100 dark:bg-zinc-800 rounded w-2/3" />
            </div>
          </div>
          <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded-full" />
        </div>
      ) : !hasData ? (
        /* Empty state — tanpa data palsu, konsisten "null = —, bukan karangan" */
        <p className="text-xs text-zinc-500 py-8 text-center">
          Connect wallet atau masukkan alamat untuk melihat komposisi aset.
        </p>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <Donut breakdown={breakdown} />

            {/* Legend — list semantik, nilai null ditampilkan "—" */}
            <ul className="flex-1 min-w-0 w-full flex flex-col gap-2.5">
              {slices.map((s) => {
                const meta = CATEGORY_META[s.category];
                return (
                  <li
                    key={s.category}
                    title={s.topSymbols.length > 0 ? `Top: ${s.topSymbols.join(", ")}` : undefined}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", meta.dotClass)} />
                    <span className="font-medium truncate">{s.label}</span>
                    <span className="ml-auto flex items-center gap-3 tabular-nums">
                      <span className="w-12 text-right text-zinc-500">{s.pct.toFixed(1)}%</span>
                      <span className="w-14 text-right font-semibold">
                        {s.valueUsd > 0 ? fmtUsd(s.valueUsd, { compact: true }) : "—"}
                      </span>
                      <span className="w-10 text-right text-zinc-500">{s.count} aset</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Segmented bar proporsional — width % per kategori */}
          <div
            className="mt-5 flex h-3 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800"
            role="img"
            aria-label={
              "Proporsi kategori: " +
              slices
                .filter((s) => s.pct > 0)
                .map((s) => `${s.label} ${s.pct.toFixed(1)}%`)
                .join(", ")
            }
          >
            {slices
              .filter((s) => s.pct > 0)
              .map((s) => (
                <div
                  key={s.category}
                  title={`${s.label} • ${s.pct.toFixed(1)}%`}
                  className={cn("h-full", CATEGORY_META[s.category].barClass)}
                  style={{ width: `${s.pct}%` }}
                />
              ))}
          </div>

          {/* Risk & Liquidity — dua progress bar + skor berbobot + insight */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-4 flex flex-col gap-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Risk &amp; liquidity</p>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">Defensive (stable)</span>
                  <span className="tabular-nums text-zinc-500">{hasPricedValue ? `${risk.defensivePct.toFixed(1)}%` : "—"}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Porsi aset defensif (stablecoin)"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={hasPricedValue ? Math.round(risk.defensivePct) : undefined}
                  className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden"
                >
                  <div className="h-full bg-emerald-500" style={{ width: `${hasPricedValue ? Math.min(100, risk.defensivePct) : 0}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-medium">Volatile (major/defi/ecosystem)</span>
                  <span className="tabular-nums text-zinc-500">{hasPricedValue ? `${risk.volatilePct.toFixed(1)}%` : "—"}</span>
                </div>
                <div
                  role="progressbar"
                  aria-label="Porsi aset volatil (major/defi/ecosystem)"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={hasPricedValue ? Math.round(risk.volatilePct) : undefined}
                  className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700 overflow-hidden"
                >
                  <div className="h-full bg-amber-500" style={{ width: `${hasPricedValue ? Math.min(100, risk.volatilePct) : 0}%` }} />
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-zinc-50 dark:bg-zinc-800 p-4 flex flex-col gap-2">
              <p className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Risk score</p>
              {hasPricedValue ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold tabular-nums leading-none">{risk.score.toFixed(1)}</span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                        VERDICT_CHIP[risk.verdict]
                      )}
                    >
                      {risk.verdict}
                    </span>
                    <span className="text-[11px] text-zinc-500">/ 100</span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">{VERDICT_INSIGHT[risk.verdict]}</p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold tabular-nums leading-none text-zinc-400">—</span>
                    <span className="text-[11px] text-zinc-500">/ 100</span>
                  </div>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    Belum ada posisi berharga — skor risiko tidak tersedia (aset tanpa harga tidak dikarang).
                  </p>
                </>
              )}
            </div>
          </div>

          {/* Transparansi: aset tanpa harga tidak memengaruhi skor */}
          {breakdown.unclassifiedCount > 0 && (
            <p className="mt-4 text-[11px] text-zinc-500">
              {breakdown.unclassifiedCount} aset tanpa harga — ditampilkan &ldquo;&mdash;&rdquo;, tidak masuk total &amp; skor
              (total bernilai {fmtUsd(totalUsd, { compact: true })}).
            </p>
          )}
        </>
      )}
    </div>
  );
}
