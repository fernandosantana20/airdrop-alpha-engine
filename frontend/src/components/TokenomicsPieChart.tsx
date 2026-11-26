"use client";

import { useState } from "react";
import type { DeepMetrics } from "@/types/airdrop";
import { formatUsd } from "@/lib/api";

interface TokenomicsPieChartProps {
  deepMetrics?: DeepMetrics;
}

function formatSupply(value: number | null | undefined, symbol?: string | null): string {
  if (value === null || value === undefined) return "Não divulgado";
  let formatted = "";
  if (value >= 1_000_000_000_000) formatted = `${(value / 1_000_000_000_000).toFixed(2)}T`;
  else if (value >= 1_000_000_000) formatted = `${(value / 1_000_000_000).toFixed(2)}B`;
  else if (value >= 1_000_000) formatted = `${(value / 1_000_000).toFixed(2)}M`;
  else if (value >= 1_000) formatted = `${(value / 1_000).toFixed(1)}K`;
  else formatted = value.toFixed(0);
  return symbol ? `${formatted} ${symbol}` : formatted;
}

export function TokenomicsPieChart({ deepMetrics }: TokenomicsPieChartProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const tokenomics = deepMetrics?.tokenomics;
  const tokenSymbol = deepMetrics?.token_symbol;
  const slices = tokenomics?.slices || [];
  const total = slices.reduce((acc, s) => acc + s.percentage, 0) || 100;
  const activeSlice = slices.find((s) => s.key === activeKey) || null;

  const size = 152;
  const strokeWidth = 22;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  let cumulativePct = 0;

  return (
    <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Distribuição de Tokenomics &amp; Supply
          </h3>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            {tokenomics?.source_label || "Alocação de supply"}
          </p>
        </div>
        <span
          className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
            tokenomics?.source === "documentacao"
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              : "bg-elevated text-fg-secondary border border-border"
          }`}
        >
          {tokenomics?.source === "documentacao"
            ? "Oficial (Docs)"
            : tokenSymbol
            ? `Token: ${tokenSymbol}`
            : "Pré-TGE"}
        </span>
      </div>

      {/* Supply, Float & FDV Strip */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-canvas px-2.5 py-2">
          <p className="text-[10px] text-fg-muted">Total Supply</p>
          <p className="mt-0.5 truncate font-mono-code text-xs font-semibold text-fg">
            {formatSupply(deepMetrics?.total_supply, tokenSymbol)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-canvas px-2.5 py-2">
          <p className="text-[10px] text-fg-muted">Circulante / Float</p>
          <p className="mt-0.5 truncate font-mono-code text-xs font-semibold text-fg">
            {deepMetrics?.circulating_supply != null
              ? `${formatSupply(deepMetrics.circulating_supply)}${
                  deepMetrics.float_pct != null ? ` (${deepMetrics.float_pct}%)` : ""
                }`
              : "Pré-TGE"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-canvas px-2.5 py-2">
          <p className="text-[10px] text-fg-muted">FDV / Preço</p>
          <p className="mt-0.5 truncate font-mono-code text-xs font-semibold text-fg">
            {deepMetrics?.fdv_usd != null
              ? formatUsd(deepMetrics.fdv_usd)
              : deepMetrics?.airdrop_estimate?.expected_fdv_usd
              ? `~${formatUsd(deepMetrics.airdrop_estimate.expected_fdv_usd)}`
              : "N/A"}
          </p>
          {deepMetrics?.current_price_usd != null && (
            <p className="font-mono-code text-[10px] text-fg-muted">
              ${deepMetrics.current_price_usd < 1
                ? deepMetrics.current_price_usd.toFixed(4)
                : deepMetrics.current_price_usd.toFixed(2)}
            </p>
          )}
        </div>
      </div>

      {slices.length === 0 ? (
        <p className="mt-4 text-xs text-fg-muted">
          Clique em reanalisar (↻) no topo para gerar o gráfico de tokenomics.
        </p>
      ) : (
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
          {/* Interactive SVG Donut / Pie Chart */}
          <div
            className="relative flex shrink-0 items-center justify-center"
            style={{ width: size, height: size }}
          >
            <svg width={size} height={size} className="-rotate-90">
              <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={strokeWidth}
                className="stroke-track"
              />
              {slices.map((slice) => {
                const frac = slice.percentage / total;
                const dashLen = frac * circumference;
                const dashOffset = -cumulativePct * circumference;
                cumulativePct += frac;
                const isDimmed = activeKey !== null && activeKey !== slice.key;
                return (
                  <circle
                    key={slice.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={slice.color}
                    strokeWidth={activeKey === slice.key ? strokeWidth + 3 : strokeWidth}
                    strokeDasharray={`${Math.max(0, dashLen - 1.5)} ${circumference}`}
                    strokeDashoffset={dashOffset}
                    opacity={isDimmed ? 0.35 : 1}
                    className="cursor-pointer transition-all duration-200"
                    onMouseEnter={() => setActiveKey(slice.key)}
                    onMouseLeave={() => setActiveKey(null)}
                    onClick={() =>
                      setActiveKey((prev) => (prev === slice.key ? null : slice.key))
                    }
                  />
                );
              })}
            </svg>

            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-3 text-center">
              <span className="font-mono-code text-base font-bold text-fg">
                {activeSlice ? `${activeSlice.percentage}%` : "100%"}
              </span>
              <span className="mt-0.5 line-clamp-2 text-[10px] leading-tight text-fg-muted">
                {activeSlice ? activeSlice.label : tokenSymbol || "Supply"}
              </span>
            </div>
          </div>

          {/* Interactive Legend */}
          <div className="w-full flex-1 space-y-1.5">
            {slices.map((slice) => (
              <button
                key={slice.key}
                type="button"
                onMouseEnter={() => setActiveKey(slice.key)}
                onMouseLeave={() => setActiveKey(null)}
                onClick={() =>
                  setActiveKey((prev) => (prev === slice.key ? null : slice.key))
                }
                className={`flex w-full items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition ${
                  activeKey === slice.key
                    ? "border-border-strong bg-elevated"
                    : "border-transparent bg-canvas/70 hover:border-border"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  />
                  <span className="truncate text-fg-secondary">{slice.label}</span>
                </span>
                <span className="shrink-0 font-mono-code font-semibold text-fg">
                  {slice.percentage}%
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
