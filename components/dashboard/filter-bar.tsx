"use client";

import { useCallback, useMemo } from "react";
import type { PortfolioPosition } from "@/lib/compat";
import { downloadCsv, toCsv, type FilterState } from "@/lib/filter";

export type { FilterState };

interface FilterBarProps {
  filters: FilterState;
  onChange: (f: FilterState) => void;
  counts: { total: number; filtered: number; hiddenDust: number; hiddenSuspicious: number };
  /** Posisi yang sudah ter-filter — dipakai untuk export CSV. Opsional agar tetap kompatibel dengan kontrak minimal. */
  filteredPositions?: PortfolioPosition[];
  /** Alternatif nama prop jika caller kirim `positions` */
  positions?: PortfolioPosition[];
}

export function FilterBar({ filters, onChange, counts, filteredPositions, positions }: FilterBarProps) {
  const dataForExport = useMemo(
    () => filteredPositions ?? positions ?? [],
    [filteredPositions, positions],
  );

  const handleExport = useCallback(() => {
    const csv = toCsv(dataForExport);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `assets-${stamp}.csv`);
  }, [dataForExport]);

  const toggle = (key: keyof FilterState) => {
    onChange({ ...filters, [key]: !filters[key] });
  };

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-col gap-4">
      {/* Baris atas: search + sort + export */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        {/* Search */}
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="11" cy="11" r="7" />
              <path d="M16.5 16.5 21 21" />
            </svg>
          </span>
          <input
            value={filters.search}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            placeholder="Cari symbol, nama, atau address…"
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 pl-9 pr-8 py-2.5 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10 focus:border-zinc-300 dark:focus:border-zinc-600"
          />
          {filters.search && (
            <button
              onClick={() => onChange({ ...filters, search: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              aria-label="Clear search"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-widest text-zinc-500 whitespace-nowrap">Urutkan</label>
          <select
            value={filters.sortBy}
            onChange={(e) => onChange({ ...filters, sortBy: e.target.value as FilterState["sortBy"] })}
            className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          >
            <option value="valueDesc">Nilai tertinggi</option>
            <option value="valueAsc">Nilai terendah</option>
            <option value="balanceDesc">Saldo terbanyak</option>
            <option value="changeDesc">Perubahan 24j</option>
          </select>
        </div>

        {/* Export */}
        <button
          onClick={handleExport}
          disabled={dataForExport.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition whitespace-nowrap"
          title={dataForExport.length === 0 ? "Tidak ada data untuk di-export" : `Export ${dataForExport.length} baris ke CSV`}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 3v13M8 11l4 4 4-4" />
            <path d="M3 17v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" />
          </svg>
          Export CSV
        </button>
      </div>

      {/* Baris filter toggles */}
      <div className="flex flex-wrap items-center gap-2">
        <Toggle
          active={filters.hideDust}
          onClick={() => toggle("hideDust")}
          label={`Sembunyikan dust (< $${filters.dustThreshold ?? 1})`}
          count={counts.hiddenDust}
        />
        <Toggle
          active={filters.hideSuspicious}
          onClick={() => toggle("hideSuspicious")}
          label="Sembunyikan suspicious"
          count={counts.hiddenSuspicious}
        />
        <Toggle
          active={filters.hideUnpriced}
          onClick={() => toggle("hideUnpriced")}
          label="Sembunyikan tanpa harga"
        />
        {(filters.search || filters.hideDust || filters.hideSuspicious || filters.hideUnpriced) && (
          <button
            onClick={() =>
              onChange({
                ...filters,
                search: "",
                hideDust: false,
                hideSuspicious: false,
                hideUnpriced: false,
              })
            }
            className="ml-1 text-xs font-medium underline decoration-zinc-300 dark:decoration-zinc-600 underline-offset-4 hover:text-zinc-900 dark:hover:text-white"
          >
            Reset filter
          </button>
        )}
      </div>

      {/* Badge count */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-1 text-xs font-medium">
          Menampilkan <span className="mx-1 font-bold">{counts.filtered}</span> dari{" "}
          <span className="ml-1 font-bold">{counts.total}</span>
        </span>
        {counts.filtered !== counts.total && (
          <span className="text-xs text-zinc-500">
            {counts.total - counts.filtered} tersembunyi oleh filter
          </span>
        )}
      </div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={
        active
          ? "inline-flex items-center gap-2 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-3.5 py-1.5 text-xs font-semibold border border-zinc-900 dark:border-white"
          : "inline-flex items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3.5 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
      }
    >
      <span
        className={
          active
            ? "h-3.5 w-3.5 rounded-full bg-white dark:bg-zinc-900 flex items-center justify-center text-[10px]"
            : "h-3.5 w-3.5 rounded-full border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800"
        }
      >
        {active ? "✓" : null}
      </span>
      {label}
      {typeof count === "number" && count > 0 ? (
        <span
          className={
            active
              ? "ml-0.5 rounded-full bg-white/20 dark:bg-zinc-900/10 px-1.5 py-0.5 text-[10px] font-bold"
              : "ml-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-zinc-500"
          }
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}
