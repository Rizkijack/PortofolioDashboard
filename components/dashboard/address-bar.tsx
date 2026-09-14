"use client";

import { useState, useCallback, useEffect, useId } from "react";
import { isAddress } from "@/lib/chains";
import { shortAddr } from "@/lib/utils";

export interface WatchlistEntry {
  address: string;
  label: string;
  addedAt: number;
}

const STORAGE_KEY = "portfolio:watchlist_v1";

const DEFAULT_PRESETS: Array<{ label: string; address: string }> = [
  { label: "vitalik.eth", address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
  { label: "Binance 8", address: "0xF977814e90dA44bFA03b6295A0616a897441aceC" },
];

interface AddressBarProps {
  currentAddress?: string;
  connectedWalletAddress?: string;
  onSelectAddress: (address: string | undefined) => void;
}

export function AddressBar({
  currentAddress,
  connectedWalletAddress,
  onSelectAddress,
}: AddressBarProps) {
  const [inputVal, setInputVal] = useState(currentAddress ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // HYDRATION-SAFE: mulai dari [] di server & client, baca localStorage +
  // seed preset di useEffect (setelah mount) — bukan di state initializer.
  const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [showSaveModal, setShowSaveModal] = useState(false);
  const labelInputId = useId();

  // Load watchlist dari localStorage sekali setelah mount; jika kosong, seed
  // preset bawaan. Dijalankan di sini (bukan initializer render) agar render
  // pertama selalu identik server vs client (tanpa hydration mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as WatchlistEntry[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          // eslint-disable-next-line react-hooks/set-state-in-effect -- load-once-on-mount dari external system (localStorage): sekali saja, bukan cascade per render.
          setWatchlist(parsed);
          return;
        }
      }
      const initial = DEFAULT_PRESETS.map((p) => ({
        address: p.address,
        label: p.label,
        addedAt: Date.now(),
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      setWatchlist(initial);
    } catch {
      // localStorage tidak tersedia / korup — biarkan list kosong.
    }
  }, []);

  // Render-time sync saat currentAddress berubah dari luar
  const [prevAddress, setPrevAddress] = useState(currentAddress);
  if (prevAddress !== currentAddress) {
    setPrevAddress(currentAddress);
    setInputVal(currentAddress ?? "");
    setErrorMsg(null);
  }

  const saveWatchlistToStorage = (list: WatchlistEntry[]) => {
    setWatchlist(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      // ignore
    }
  };

  const handleSearch = useCallback(
    (addrToSearch?: string) => {
      const target = (addrToSearch ?? inputVal).trim();
      if (!target) {
        onSelectAddress(undefined);
        setErrorMsg(null);
        return;
      }
      if (!isAddress(target)) {
        setErrorMsg("Alamat tidak valid — masukkan 0x diikuti 40 karakter heksadesimal.");
        return;
      }
      setErrorMsg(null);
      onSelectAddress(target);
      setShowDropdown(false);
    },
    [inputVal, onSelectAddress]
  );

  const handleSaveToWatchlist = () => {
    if (!currentAddress || !isAddress(currentAddress)) return;
    const cleanLabel = newLabel.trim() || shortAddr(currentAddress);
    const existingIdx = watchlist.findIndex((w) => w.address.toLowerCase() === currentAddress.toLowerCase());
    let updated: WatchlistEntry[];
    if (existingIdx >= 0) {
      updated = [...watchlist];
      updated[existingIdx] = { ...updated[existingIdx], label: cleanLabel };
    } else {
      updated = [{ address: currentAddress, label: cleanLabel, addedAt: Date.now() }, ...watchlist];
    }
    saveWatchlistToStorage(updated);
    setShowSaveModal(false);
    setNewLabel("");
  };

  const handleRemoveFromWatchlist = (addr: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = watchlist.filter((w) => w.address.toLowerCase() !== addr.toLowerCase());
    saveWatchlistToStorage(updated);
  };

  const isCurrentInWatchlist = watchlist.some(
    (w) => w.address.toLowerCase() === currentAddress?.toLowerCase()
  );

  const isConnectedMode =
    Boolean(connectedWalletAddress) &&
    connectedWalletAddress?.toLowerCase() === currentAddress?.toLowerCase();

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 flex flex-col gap-3 shadow-xs">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Input Bar */}
        <div className="relative flex-1">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </span>

          <input
            type="text"
            value={inputVal}
            onChange={(e) => {
              setInputVal(e.target.value);
              setErrorMsg(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            placeholder="Paste alamat EVM (0x...) untuk memantau wallet / whale…"
            className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 pl-10 pr-24 py-2.5 text-sm font-mono placeholder:text-zinc-400 placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-white/10"
          />

          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {inputVal && (
              <button
                type="button"
                onClick={() => {
                  setInputVal("");
                  setErrorMsg(null);
                  if (connectedWalletAddress) onSelectAddress(connectedWalletAddress);
                  else onSelectAddress(undefined);
                }}
                className="p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-lg"
                title="Clear input"
              >
                ✕
              </button>
            )}
            <button
              type="button"
              onClick={() => handleSearch()}
              className="rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-3 py-1.5 text-xs font-semibold hover:opacity-90 transition"
            >
              Track
            </button>
          </div>
        </div>

        {/* Watchlist & Mode Buttons */}
        <div className="flex items-center gap-2">
          {/* Watchlist dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowDropdown(!showDropdown)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3.5 py-2.5 text-xs font-semibold hover:bg-zinc-50 dark:hover:bg-zinc-700/60 transition"
            >
              <span>★ Watchlist ({watchlist.length})</span>
              <span className="text-[10px] text-zinc-400">▼</span>
            </button>

            {showDropdown && (
              <div className="absolute right-0 top-full mt-1.5 z-30 w-72 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl p-2 animate-fadeIn">
                <div className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Saved Wallets</span>
                  <span className="text-[10px] text-zinc-400">Local Storage</span>
                </div>

                <div className="max-h-56 overflow-y-auto py-1 divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {watchlist.map((w) => {
                    const active = w.address.toLowerCase() === currentAddress?.toLowerCase();
                    return (
                      <div
                        key={w.address}
                        onClick={() => handleSearch(w.address)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs cursor-pointer transition ${
                          active
                            ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 font-semibold"
                            : "hover:bg-zinc-50 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium">{w.label}</p>
                          <p className={`font-mono text-[11px] truncate ${active ? "opacity-70" : "text-zinc-500"}`}>
                            {shortAddr(w.address)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleRemoveFromWatchlist(w.address, e)}
                          className={`ml-2 p-1 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-500 transition`}
                          title="Hapus dari watchlist"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Save current button */}
          {currentAddress && isAddress(currentAddress) && (
            <button
              type="button"
              onClick={() => {
                const found = watchlist.find((w) => w.address.toLowerCase() === currentAddress.toLowerCase());
                setNewLabel(found?.label ?? "");
                setShowSaveModal(true);
              }}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition ${
                isCurrentInWatchlist
                  ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300"
                  : "border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50"
              }`}
            >
              <span>{isCurrentInWatchlist ? "★ Saved" : "☆ Save"}</span>
            </button>
          )}

          {/* Quick toggle to Connected Wallet if currently in watch mode */}
          {connectedWalletAddress && !isConnectedMode && (
            <button
              type="button"
              onClick={() => onSelectAddress(connectedWalletAddress)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 px-3 py-2.5 text-xs font-semibold hover:bg-emerald-100 transition whitespace-nowrap"
              title="Kembali ke wallet yang terhubung"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              My Wallet
            </button>
          )}
        </div>
      </div>

      {/* Validation Error Message */}
      {errorMsg && (
        <p className="text-xs font-medium text-red-600 dark:text-red-400">
          {errorMsg}
        </p>
      )}

      {/* Mode Status Pill */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-zinc-100 dark:border-zinc-800/80">
        <div className="flex items-center gap-2">
          {currentAddress ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-0.5 text-[11px] font-mono">
              <span className={`h-1.5 w-1.5 rounded-full ${isConnectedMode ? "bg-emerald-500" : "bg-sky-500"}`} />
              {isConnectedMode ? "Connected Wallet" : "Watcher Mode (Read-only)"}: {shortAddr(currentAddress)}
            </span>
          ) : (
            <span className="text-zinc-500 text-[11px]">
              Belum ada wallet aktif. Ketik alamat di atas atau connect wallet.
            </span>
          )}
        </div>

        {/* Preset quick links */}
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
          <span>Contoh:</span>
          {DEFAULT_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => handleSearch(p.address)}
              className="underline decoration-zinc-300 hover:text-zinc-900 dark:hover:text-white"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Save to Watchlist Modal */}
      {showSaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-2xl flex flex-col gap-4">
            <div>
              <h4 className="text-sm font-bold">Simpan ke Watchlist</h4>
              <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">{currentAddress}</p>
            </div>

            <div>
              <label htmlFor={labelInputId} className="text-xs font-medium text-zinc-600 dark:text-zinc-400 block mb-1">
                Nama / Label Alias:
              </label>
              <input
                id={labelInputId}
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Contoh: Main Wallet, Vitalik, dsb."
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="rounded-xl border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveToWatchlist}
                className="rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 px-4 py-1.5 text-xs font-semibold hover:opacity-90"
              >
                Simpan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
