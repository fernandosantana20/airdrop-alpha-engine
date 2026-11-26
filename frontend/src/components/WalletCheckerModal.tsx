"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, Wallet, X } from "lucide-react";
import type { WalletCheckResult } from "@/types/airdrop";
import { api } from "@/lib/api";
import { ScoreRing } from "./ScoreRing";

interface WalletCheckerModalProps {
  onClose: () => void;
}

export function WalletCheckerModal({ onClose }: WalletCheckerModalProps) {
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<WalletCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = address.trim();
    if (!cleaned) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.checkWallet(cleaned);
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao verificar carteira.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-sm sm:p-4">
      <div className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-canvas p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-fg">
              <Wallet className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-sm font-semibold text-fg sm:text-base">
                Saúde Anti-Sybil da Carteira (Somente Leitura)
              </h2>
              <p className="text-[11px] text-fg-muted">
                Suporta endereços EVM (8 redes de airdrop) e Solana via RPC público — sem conectar carteira nem pedir assinatura.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="rounded-lg border border-border bg-surface p-1.5 text-fg-muted hover:text-fg"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Cole seu endereço público EVM (0x...) ou Solana"
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 font-mono-code text-base sm:text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
            required
          />
          <button
            type="submit"
            disabled={loading || !address.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-btn px-4 py-2 text-xs font-medium text-btn-fg transition hover:opacity-90 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Verificando
              </>
            ) : (
              <>
                <ShieldCheck className="h-3.5 w-3.5" />
                Verificar
              </>
            )}
          </button>
        </form>

        {error && (
          <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
            {error}
          </div>
        )}

        {result && (
          <div className="mt-5 space-y-4">
            {/* Score Summary */}
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center gap-3.5">
                <ScoreRing score={result.sybil_score} size={60} strokeWidth={5} />
                <div>
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold ${
                      result.sybil_score >= 75
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : result.sybil_score >= 45
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                    }`}
                  >
                    {result.verdict}
                  </span>
                  <p className="mt-1 font-mono-code text-[11px] text-fg-muted">
                    {result.address.slice(0, 10)}...{result.address.slice(-8)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <div>
                  <p className="text-[10px] text-fg-muted">
                    {result.wallet_type === "SOLANA" ? "Txs (recentes)" : "Total Txs"}
                  </p>
                  <p className="font-mono-code font-semibold text-fg">
                    {result.total_transactions}
                    {result.wallet_type === "SOLANA" && result.total_transactions === 100
                      ? "+"
                      : ""}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-fg-muted">Redes Ativas</p>
                  <p className="font-mono-code font-semibold text-fg">
                    {result.active_chains_count}/{result.total_chains_checked || result.chains.length}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-fg-muted">
                    Saldo {result.native_symbol || "ETH"}
                  </p>
                  <p className="font-mono-code font-semibold text-fg">
                    {result.total_eth_balance.toFixed(4)}
                  </p>
                </div>
              </div>
            </div>

            {/* Chains Grid */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {result.chains.map((ch) => (
                <div
                  key={ch.chain}
                  className="rounded-xl border border-border bg-surface px-3 py-2.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate font-medium text-fg">{ch.chain}</span>
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        ch.active ? "bg-emerald-500 dark:bg-emerald-400" : "bg-fg-muted/40"
                      }`}
                    />
                  </div>
                  <p className="mt-1 font-mono-code text-[11px] text-fg-secondary">
                    {ch.symbol === "SPL"
                      ? `${ch.tx_count} tokens`
                      : `${ch.tx_count} txs · ${ch.balance} ${ch.symbol}`}
                  </p>
                </div>
              ))}
            </div>

            {/* 4 Checks */}
            <div className="space-y-1.5">
              {result.checks.map((chk, i) => {
                const badgeStyle =
                  chk.status === "PASS"
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : chk.status === "WARN"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    : "bg-rose-500/15 text-rose-700 dark:text-rose-400";
                return (
                  <div
                    key={i}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-medium text-fg">{chk.label}</p>
                      <p className="mt-0.5 text-[11px] text-fg-secondary">
                        {chk.detail}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeStyle}`}
                    >
                      {chk.status === "PASS"
                        ? "OK"
                        : chk.status === "WARN"
                        ? "ATENÇÃO"
                        : "RISCO"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
