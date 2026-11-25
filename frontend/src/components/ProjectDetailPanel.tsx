"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  BookOpen,
  CheckCircle2,
  Circle,
  ExternalLink,
  GitBranch,
  Globe,
  Loader2,
  MessageSquare,
  Radar,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import type { MonitorCheckResult, ProjectDetail } from "@/types/airdrop";
import { formatRelativeDate, formatUsd } from "@/lib/api";
import { ScoreRing } from "./ScoreRing";

interface ProjectDetailPanelProps {
  project: ProjectDetail;
  onClose: () => void;
  onToggleTask: (taskId: number, completed: boolean) => Promise<void>;
  onToggleMonitor: (enabled: boolean) => Promise<void>;
  onCheckUpdates: () => Promise<MonitorCheckResult | null>;
  onDelete: (id: number) => Promise<void>;
}

const BREAKDOWN_META = [
  { key: "product_utility", label: "Utilidade & Produto", max: 20 },
  { key: "backing_funding", label: "Backing & Funding (VCs)", max: 20 },
  { key: "tvl_traction", label: "TVL & Tração On-Chain", max: 20 },
  { key: "github_activity", label: "Atividade no GitHub", max: 15 },
  { key: "airdrop_potential", label: "Potencial de Airdrop / Tokenless", max: 15 },
  { key: "security_rug_resistance", label: "Segurança & Anti-Rug", max: 10 },
] as const;

export function ProjectDetailPanel({
  project,
  onClose,
  onToggleTask,
  onToggleMonitor,
  onCheckUpdates,
  onDelete,
}: ProjectDetailPanelProps) {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [lastCheckMsg, setLastCheckMsg] = useState<string | null>(null);
  const [togglingTaskId, setTogglingTaskId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleCheckNow = async () => {
    setCheckingUpdate(true);
    setLastCheckMsg(null);
    try {
      const res = await onCheckUpdates();
      if (res) {
        setLastCheckMsg(
          res.changed
            ? `Alteração detectada! ${res.alert_sent ? "(Alerta enviado no Telegram)" : "(Snapshot salvo no histórico)"}`
            : res.diff_summary || "Nenhuma alteração detectada."
        );
      }
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleTaskClick = async (taskId: number, current: boolean) => {
    setTogglingTaskId(taskId);
    try {
      await onToggleTask(taskId, !current);
    } finally {
      setTogglingTaskId(null);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete(project.id);
    } finally {
      setDeleting(false);
    }
  };

  const completedCount = project.tasks.filter((t) => t.completed).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm">
      <div className="relative h-full w-full max-w-4xl overflow-y-auto border-l border-border bg-canvas p-6 shadow-2xl md:p-8">
        {/* Top bar */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-4">
            <ScoreRing score={project.fundamental_score} size={76} strokeWidth={6} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-slate-100">{project.name}</h2>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                    project.verdict === "APPROVED"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                      : project.verdict === "WATCHLIST"
                      ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-300"
                  }`}
                >
                  {project.verdict}
                </span>
                <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs text-slate-400">
                  {project.analysis_mode === "gemini" ? "Gemini AI" : "Modo Heurístico"}
                </span>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <a
                  href={project.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-emerald-300"
                >
                  <Globe className="h-3.5 w-3.5" />
                  Site Oficial
                  <ExternalLink className="h-3 w-3" />
                </a>
                {project.docs_url && (
                  <a
                    href={project.docs_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-cyan-300"
                  >
                    <BookOpen className="h-3.5 w-3.5" />
                    Docs
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {project.github_url && (
                  <a
                    href={project.github_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-slate-200"
                  >
                    <GitBranch className="h-3.5 w-3.5" />
                    GitHub
                    {project.github_stars !== null && ` (${project.github_stars}★)`}
                  </a>
                )}
                {project.twitter_url && (
                  <a
                    href={project.twitter_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-sky-300"
                  >
                    X / Twitter
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {project.discord_url && (
                  <a
                    href={project.discord_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-indigo-300"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    Discord
                  </a>
                )}
                {project.telegram_url && (
                  <a
                    href={project.telegram_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 hover:text-cyan-300"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Telegram
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Remover projeto"
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-2 text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={onClose}
              className="rounded-xl border border-border bg-surface p-2 text-slate-300 transition hover:bg-elevated hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Executive summary */}
        <section className="mt-6 rounded-2xl border border-border bg-surface/80 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Resumo Executivo de Due Diligence
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">
            {project.executive_summary}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-canvas/70 p-3">
              <p className="text-[11px] text-slate-500">TVL On-Chain</p>
              <p className="mt-1 font-mono-code text-base font-bold text-slate-100">
                {formatUsd(project.tvl_usd)}
              </p>
              {project.tvl_change_7d !== null && (
                <p
                  className={`text-[11px] font-mono-code ${
                    project.tvl_change_7d >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {project.tvl_change_7d >= 0 ? "+" : ""}
                  {project.tvl_change_7d.toFixed(1)}% (7d)
                </p>
              )}
            </div>

            <div className="rounded-xl border border-border/70 bg-canvas/70 p-3">
              <p className="text-[11px] text-slate-500">VC Funding</p>
              <p className="mt-1 font-mono-code text-base font-bold text-slate-100">
                {formatUsd(project.funding_usd)}
              </p>
              <p className="text-[11px] text-slate-500">
                {project.investors.length} investidor(es)
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-canvas/70 p-3">
              <p className="text-[11px] text-slate-500">GitHub</p>
              <p className="mt-1 font-mono-code text-base font-bold text-slate-100">
                {project.github_stars !== null ? `${project.github_stars} ★` : "N/A"}
              </p>
              <p className="text-[11px] text-slate-500">
                {project.github_repos_count !== null
                  ? `${project.github_repos_count} repo(s)`
                  : "Não indexado"}
              </p>
            </div>

            <div className="rounded-xl border border-border/70 bg-canvas/70 p-3">
              <p className="text-[11px] text-slate-500">Setor / Chains</p>
              <p className="mt-1 truncate text-sm font-semibold text-slate-100">
                {project.category || "Web3"}
              </p>
              <p className="truncate text-[11px] text-slate-500">
                {project.chains.length > 0
                  ? project.chains.slice(0, 3).join(", ")
                  : "Pre-Mainnet / Multi"}
              </p>
            </div>
          </div>

          {project.investors.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 mr-1">
                Backers:
              </span>
              {project.investors.slice(0, 10).map((inv) => (
                <span
                  key={inv}
                  className="rounded-md border border-border bg-canvas px-2 py-0.5 text-xs text-slate-300"
                >
                  {inv}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* 6-pillar Score Breakdown */}
        <section className="mt-6 rounded-2xl border border-border bg-surface/80 p-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Auditoria de Fundamentos (6 Pilares — 0 a 100)
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {BREAKDOWN_META.map(({ key, label, max }) => {
              const val = project.score_breakdown?.[key] ?? 0;
              const pct = Math.min(100, Math.round((val / max) * 100));
              const barColor =
                pct >= 70
                  ? "bg-emerald-400"
                  : pct >= 45
                  ? "bg-amber-400"
                  : "bg-rose-400";
              return (
                <div
                  key={key}
                  className="rounded-xl border border-border/60 bg-canvas/60 p-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">{label}</span>
                    <span className="font-mono-code font-semibold text-slate-100">
                      {val}/{max}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Bull Case vs Red Flags */}
        <section className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-5">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
              <TrendingUp className="h-4 w-4" />
              Bull Case &amp; Catalisadores
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-200">
              {project.bull_case.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-5">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-rose-300">
              <AlertTriangle className="h-4 w-4" />
              Red Flags &amp; Riscos
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-slate-200">
              {project.red_flags.length > 0 ? (
                project.red_flags.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-rose-400 shrink-0" />
                    <span>{item}</span>
                  </li>
                ))
              ) : (
                <li className="text-slate-400">Nenhum red flag crítico identificado.</li>
              )}
            </ul>
          </div>
        </section>

        {/* Anti-Sybil Strategic Plan */}
        <section className="mt-6 rounded-2xl border border-border bg-surface/80 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              {project.fundamental_score >= 70 ? (
                <ShieldCheck className="h-4 w-4 text-emerald-400" />
              ) : (
                <ShieldAlert className="h-4 w-4 text-amber-400" />
              )}
              Plano de Interação Estratégica (Anti-Sybil)
            </h3>
            {project.tasks.length > 0 && (
              <span className="font-mono-code text-xs text-emerald-300">
                {completedCount}/{project.tasks.length} concluídas
              </span>
            )}
          </div>

          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            {project.anti_sybil_strategy}
          </p>

          {project.tasks.length === 0 ? (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-200">
              Este projeto ficou abaixo do corte mínimo de <strong>70 pontos</strong>.
              Por segurança de capital e foco em Alpha real, o plano de farming
              Anti-Sybil só é gerado para projetos aprovados (Score ≥ 70).
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {project.tasks.map((task) => (
                <div
                  key={task.id}
                  className={`rounded-xl border p-4 transition ${
                    task.completed
                      ? "border-emerald-500/25 bg-emerald-500/5 opacity-75"
                      : "border-border bg-canvas/70 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleTaskClick(task.id, task.completed)}
                      disabled={togglingTaskId === task.id}
                      className="mt-0.5 text-emerald-400 hover:text-emerald-300 shrink-0"
                    >
                      {togglingTaskId === task.id ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : task.completed ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <Circle className="h-5 w-5 text-slate-500" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4
                          className={`text-sm font-semibold ${
                            task.completed
                              ? "line-through text-slate-400"
                              : "text-slate-100"
                          }`}
                        >
                          {task.title}
                        </h4>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            task.priority === "HIGH"
                              ? "bg-rose-500/15 text-rose-300"
                              : task.priority === "MEDIUM"
                              ? "bg-amber-500/15 text-amber-300"
                              : "bg-slate-700 text-slate-300"
                          }`}
                        >
                          {task.priority}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                          {task.category}
                        </span>
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-cyan-300">
                          {task.frequency}
                        </span>
                        <span className="font-mono-code text-[10px] text-slate-400">
                          Custo est.: {task.estimated_cost_usd}
                        </span>
                      </div>

                      <p className="mt-1.5 text-xs leading-relaxed text-slate-300">
                        {task.description}
                      </p>

                      {task.anti_sybil_tip && (
                        <div className="mt-2.5 flex items-start gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[11px] text-cyan-200">
                          <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-400" />
                          <span>
                            <strong>Anti-Sybil:</strong> {task.anti_sybil_tip}
                          </span>
                        </div>
                      )}

                      {task.action_url && (
                        <a
                          href={task.action_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
                        >
                          Abrir dApp / Docs
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Roadmap & Docs Monitor */}
        <section className="mt-6 rounded-2xl border border-border bg-surface/80 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Radar className="h-4 w-4 text-cyan-400" />
                Monitoramento de Roadmap &amp; Docs
              </h3>
              <p className="mt-1 text-xs text-slate-400">
                URL monitorada:{" "}
                <span className="font-mono-code text-slate-300">
                  {project.monitored_url || project.url}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onToggleMonitor(!project.monitoring_enabled)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                  project.monitoring_enabled
                    ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20"
                    : "border-border bg-canvas text-slate-400 hover:text-slate-200"
                }`}
              >
                {project.monitoring_enabled ? (
                  <>
                    <Bell className="h-3.5 w-3.5" />
                    Monitor Ativo
                  </>
                ) : (
                  <>
                    <BellOff className="h-3.5 w-3.5" />
                    Monitor Pausado
                  </>
                )}
              </button>

              <button
                onClick={handleCheckNow}
                disabled={checkingUpdate}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-500/40 hover:text-white disabled:opacity-50"
              >
                {checkingUpdate ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Verificar Agora
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-300">{project.roadmap_summary}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Última verificação: {formatRelativeDate(project.last_checked_at)} • Hash:{" "}
            <span className="font-mono-code">
              {project.last_content_hash?.slice(0, 12) || "N/A"}
            </span>
          </p>

          {lastCheckMsg && (
            <div className="mt-3 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2 text-xs text-cyan-200">
              {lastCheckMsg}
            </div>
          )}

          {project.roadmap_snapshots.length > 0 && (
            <div className="mt-4 space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Histórico de Alterações Detectadas
              </h4>
              {project.roadmap_snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="rounded-xl border border-border bg-canvas/80 p-3.5 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{formatRelativeDate(snap.detected_at)}</span>
                    <span
                      className={
                        snap.alert_sent ? "text-emerald-400" : "text-slate-500"
                      }
                    >
                      {snap.alert_sent ? "Alerta Telegram enviado" : "Registrado localmente"}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-line text-slate-200">
                    {snap.diff_summary}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
