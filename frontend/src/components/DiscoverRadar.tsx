"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpDown,
  Check,
  ExternalLink,
  Layers,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import type { DiscoverProjectItem } from "@/types/airdrop";
import { api, formatUsd } from "@/lib/api";

interface DiscoverRadarProps {
  onAnalyzeUrl: (url: string) => Promise<void>;
}

const CHAIN_FILTERS = [
  "ALL",
  "Ethereum",
  "Base",
  "Arbitrum",
  "Solana",
  "Berachain",
  "Hyperliquid",
  "Sui",
] as const;

const TOP_AIRDROP_PLATFORMS = [
  { name: "CryptoRank", url: "https://cryptorank.io/drophunting" },
  { name: "DropsTab", url: "https://dropstab.com/activities" },
  { name: "Alpha Drops", url: "https://alphadrops.net/" },
  { name: "DappRadar", url: "https://dappradar.com/" },
  { name: "Airdrops.io", url: "https://airdrops.io/" },
] as const;

function formatListedDate(ts?: number | null): string | null {
  if (!ts) return null;
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(d);
}

export function DiscoverRadar({ onAnalyzeUrl }: DiscoverRadarProps) {
  const [items, setItems] = useState<DiscoverProjectItem[]>([]);
  const [chain, setChain] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<
    "profitability" | "tvl_desc" | "newest" | "growth_7d"
  >("profitability");
  const [search, setSearch] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [analyzingSlug, setAnalyzingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadGems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.discover({
        chain,
        search,
        sort: sortBy,
        min_tvl: 100_000,
        max_tvl: 1_000_000_000,
        limit: 24,
      });
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar projetos.");
    } finally {
      setLoading(false);
    }
  }, [chain, search, sortBy]);

  useEffect(() => {
    loadGems();
  }, [loadGems]);

  const handleAnalyzeClick = async (item: DiscoverProjectItem) => {
    setAnalyzingSlug(item.slug);
    try {
      await onAnalyzeUrl(item.url);
    } finally {
      setAnalyzingSlug(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
              <Sparkles className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Radar · Projetos Novos &amp; Tokenless (DefiLlama)
            </h2>
            <p className="mt-0.5 text-xs text-fg-muted">
              Protocolos sem token listado com TVL emergente ($100K–$150M), ordenados por crescimento 7d.
            </p>
          </div>

          <button
            onClick={loadGems}
            disabled={loading}
            className="inline-flex h-8 items-center gap-1.5 self-start rounded-lg border border-border bg-canvas px-3 text-xs text-fg-secondary transition hover:border-border-strong hover:text-fg disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        {/* Top 5 Airdrop Hunting Platforms Quick Links */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          <span className="mr-1 text-[11px] text-fg-muted">Fontes Top 5:</span>
          {TOP_AIRDROP_PLATFORMS.map((p) => (
            <a
              key={p.name}
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-canvas px-2 py-0.5 text-[11px] text-fg-secondary transition hover:border-border-strong hover:text-fg"
            >
              {p.name}
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-1 lg:pb-0">
            {CHAIN_FILTERS.map((ch) => (
              <button
                key={ch}
                onClick={() => setChain(ch)}
                className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  chain === ch
                    ? "border border-border bg-elevated text-fg"
                    : "text-fg-muted hover:text-fg"
                }`}
              >
                {ch === "ALL" ? "Todas redes" : ch}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex items-center">
              <ArrowUpDown className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-fg-muted" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                aria-label="Ordenar radar"
                className="w-full sm:w-auto appearance-none rounded-lg border border-border bg-canvas py-1.5 pl-8 pr-7 text-base sm:text-xs text-fg focus:border-border-strong focus:outline-none"
              >
                <option value="profitability">Mais Rentável / Probabilidade</option>
                <option value="tvl_desc">Maior TVL</option>
                <option value="newest">Último Lançamento</option>
                <option value="growth_7d">Maior Crescimento (7d)</option>
              </select>
            </div>

            <div className="relative w-full sm:w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar radar..."
                className="w-full rounded-lg border border-border bg-canvas py-1.5 pl-8 pr-3 text-base sm:text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-border bg-surface p-10 text-xs text-fg-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Varrendo protocolos tokenless emergentes...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center text-xs text-fg-muted">
          Nenhum projeto encontrado para esse filtro.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {items.map((item) => {
            const isBusy = analyzingSlug === item.slug;
            return (
              <div
                key={item.slug}
                className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4 shadow-sm dark:shadow-none"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-fg">
                        {item.name}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-fg-muted">
                        {item.category}
                        {formatListedDate(item.listed_at)
                          ? ` · ${formatListedDate(item.listed_at)}`
                          : " · Tokenless"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {item.alpha_score != null && (
                        <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono-code text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                          Alpha {item.alpha_score}
                        </span>
                      )}
                      {item.tvl_change_7d !== null && (
                        <span
                          className={`font-mono-code text-[10px] font-medium ${
                            item.tvl_change_7d >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {item.tvl_change_7d >= 0 ? "+" : ""}
                          {item.tvl_change_7d.toFixed(1)}% 7d
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <Layers className="h-3 w-3 text-fg-muted shrink-0" />
                    {item.chains.slice(0, 3).map((c) => (
                      <span
                        key={c}
                        className="rounded border border-border bg-canvas px-1.5 py-0.5 text-[10px] text-fg-secondary"
                      >
                        {c}
                      </span>
                    ))}
                    {item.chains.length > 3 && (
                      <span className="text-[10px] text-fg-muted">
                        +{item.chains.length - 3}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
                  <div>
                    <span className="text-[11px] text-fg-muted">TVL </span>
                    <span className="font-mono-code text-xs font-semibold text-fg">
                      {formatUsd(item.tvl_usd)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      title="Abrir site"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border bg-canvas text-fg-muted hover:text-fg"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>

                    <button
                      onClick={() => handleAnalyzeClick(item)}
                      disabled={isBusy}
                      className={`inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-medium transition disabled:opacity-50 ${
                        item.already_analyzed
                          ? "border border-border bg-canvas text-fg-secondary hover:text-fg"
                          : "bg-btn text-btn-fg hover:opacity-90"
                      }`}
                    >
                      {isBusy ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : item.already_analyzed ? (
                        <>
                          <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                          Reanalisar
                        </>
                      ) : (
                        <>
                          Analisar
                          <ArrowRight className="h-3 w-3" />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
