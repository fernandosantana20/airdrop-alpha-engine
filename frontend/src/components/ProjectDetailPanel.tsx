"use client";

import { useState } from "react";
import {
  Bell,
  BellOff,
  BookOpen,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  ExternalLink,
  GitBranch,
  Globe,
  Instagram,
  Layers,
  Link2,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import type { EcosystemLink, MonitorCheckResult, ProjectDetail } from "@/types/airdrop";
import { formatRelativeDate, formatUsd } from "@/lib/api";
import { ScoreRing } from "./ScoreRing";

interface ProjectDetailPanelProps {
  project: ProjectDetail;
  onClose: () => void;
  onReanalyze: (url: string, docsUrl?: string | null) => Promise<void>;
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
  { key: "airdrop_potential", label: "Potencial de Airdrop", max: 15 },
  { key: "security_rug_resistance", label: "Segurança & Anti-Rug", max: 10 },
] as const;

function buildDossierMarkdown(project: ProjectDetail, links: EcosystemLink[]): string {
  const chainsStr = project.chains.length > 0 ? project.chains.join(", ") : "N/A";
  const chainTvlLines = Object.entries(project.chain_tvls || {}).map(
    ([c, v]) => `- ${c}: ${formatUsd(v)}`
  );
  const linkLines = links.map((l) => `- ${l.label}: ${l.url}`);
  const taskLines = project.tasks.map(
    (t) => `- [${t.completed ? "x" : " "}] **${t.title}** (${t.priority} | ${t.frequency}) — ${t.description}`
  );

  return [
    `# ${project.name} — Due Diligence (${project.fundamental_score}/100 · ${project.verdict})`,
    ``,
    `**Setor:** ${project.category || "Web3"} | **Redes:** ${chainsStr}`,
    `**TVL:** ${formatUsd(project.tvl_usd)} | **Funding:** ${formatUsd(project.funding_usd)} | **Backers:** ${project.investors.join(", ") || "N/A"}`,
    ``,
    `## Resumo Executivo`,
    project.executive_summary,
    ``,
    `## Anexo — Canais & Links Vinculados`,
    ...(linkLines.length > 0 ? linkLines : [`- Site: ${project.url}`]),
    ...(chainTvlLines.length > 0 ? ["", "## TVL por Rede", ...chainTvlLines] : []),
    ``,
    `## Pontos Fortes (Bull Case)`,
    ...project.bull_case.map((b) => `- ${b}`),
    ``,
    `## Riscos (Red Flags)`,
    ...(project.red_flags.length > 0 ? project.red_flags.map((r) => `- ${r}`) : ["- Nenhum red flag crítico."]),
    ...(taskLines.length > 0 ? ["", "## Plano Anti-Sybil", ...taskLines] : []),
  ].join("\n");
}

function renderLinkIcon(type: string) {
  switch (type) {
    case "website":
    case "app":
      return <Globe className="h-3.5 w-3.5 text-zinc-400" />;
    case "twitter":
      return <span className="text-xs font-bold text-zinc-300 leading-none">𝕏</span>;
    case "telegram":
      return <Send className="h-3.5 w-3.5 text-zinc-400" />;
    case "instagram":
      return <Instagram className="h-3.5 w-3.5 text-zinc-400" />;
    case "discord":
      return <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />;
    case "github":
      return <GitBranch className="h-3.5 w-3.5 text-zinc-400" />;
    case "docs":
      return <BookOpen className="h-3.5 w-3.5 text-zinc-400" />;
    case "audit":
      return <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />;
    default:
      return <Link2 className="h-3.5 w-3.5 text-zinc-400" />;
  }
}

export function ProjectDetailPanel({
  project,
  onClose,
  onReanalyze,
  onToggleTask,
  onToggleMonitor,
  onCheckUpdates,
  onDelete,
}: ProjectDetailPanelProps) {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [lastCheckMsg, setLastCheckMsg] = useState<string | null>(null);
  const [togglingTaskId, setTogglingTaskId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Build fallback ecosystem_links for older rows created before migration
  const attachedLinks: EcosystemLink[] =
    project.ecosystem_links && project.ecosystem_links.length > 0
      ? project.ecosystem_links
      : [
          { label: "Site Oficial", type: "website", url: project.url },
          ...(project.twitter_url
            ? [{ label: "X (Twitter)", type: "twitter", url: project.twitter_url }]
            : []),
          ...(project.telegram_url
            ? [{ label: "Telegram", type: "telegram", url: project.telegram_url }]
            : []),
          ...(project.instagram_url
            ? [{ label: "Instagram", type: "instagram", url: project.instagram_url }]
            : []),
          ...(project.discord_url
            ? [{ label: "Discord", type: "discord", url: project.discord_url }]
            : []),
          ...(project.github_url
            ? [{ label: "GitHub", type: "github", url: project.github_url }]
            : []),
          ...(project.docs_url
            ? [{ label: "Documentação", type: "docs", url: project.docs_url }]
            : []),
        ];

  const chainTvlEntries = Object.entries(project.chain_tvls || {});
  const totalChainTvl = chainTvlEntries.reduce((acc, [, v]) => acc + v, 0);

  const handleCopyDossier = async () => {
    await navigator.clipboard.writeText(buildDossierMarkdown(project, attachedLinks));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReanalyze = async () => {
    setReanalyzing(true);
    try {
      await onReanalyze(project.url, project.docs_url);
    } finally {
      setReanalyzing(false);
    }
  };

  const handleCheckNow = async () => {
    setCheckingUpdate(true);
    setLastCheckMsg(null);
    try {
      const res = await onCheckUpdates();
      if (res) {
        setLastCheckMsg(
          res.changed
            ? `Alteração detectada${res.alert_sent ? " · alerta enviado no Telegram" : ""}`
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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm">
      <div className="relative h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-canvas px-6 py-6 md:px-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-4">
            <ScoreRing score={project.fundamental_score} size={64} strokeWidth={5} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-zinc-100">{project.name}</h2>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                    project.verdict === "APPROVED"
                      ? "bg-emerald-500/15 text-emerald-400"
                      : project.verdict === "WATCHLIST"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-rose-500/15 text-rose-400"
                  }`}
                >
                  {project.verdict}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {project.category || "Web3"} ·{" "}
                {project.analysis_mode === "gemini" ? "Gemini AI" : "Heurístico"} ·
                Atualizado em {formatRelativeDate(project.updated_at)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCopyDossier}
              title="Copiar dossiê completo em Markdown"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-zinc-300 transition hover:border-zinc-600 hover:text-white"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button
              onClick={handleReanalyze}
              disabled={reanalyzing}
              title="Reanalisar projeto agora"
              className="rounded-lg border border-border bg-surface p-1.5 text-zinc-400 transition hover:border-zinc-600 hover:text-white disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${reanalyzing ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Remover projeto"
              className="rounded-lg border border-border bg-surface p-1.5 text-zinc-400 transition hover:border-rose-500/40 hover:text-rose-400 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-border bg-surface p-1.5 text-zinc-400 transition hover:border-zinc-600 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Summary & Key Telemetry */}
        <section className="mt-6">
          <p className="text-sm leading-relaxed text-zinc-300">
            {project.executive_summary}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-[11px] text-zinc-500">TVL On-Chain</p>
              <p className="mt-1 font-mono-code text-sm font-semibold text-zinc-100">
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

            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-[11px] text-zinc-500">Funding / Backers</p>
              <p className="mt-1 font-mono-code text-sm font-semibold text-zinc-100">
                {formatUsd(project.funding_usd)}
              </p>
              <p className="truncate text-[11px] text-zinc-500">
                {project.investors.length > 0
                  ? project.investors.slice(0, 2).join(", ")
                  : "Não divulgado"}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-[11px] text-zinc-500">GitHub</p>
              <p className="mt-1 font-mono-code text-sm font-semibold text-zinc-100">
                {project.github_stars !== null ? `${project.github_stars} ★` : "N/A"}
              </p>
              <p className="text-[11px] text-zinc-500">
                {project.github_repos_count !== null
                  ? `${project.github_repos_count} repo(s)`
                  : "Não indexado"}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-[11px] text-zinc-500">Redes Ativas</p>
              <p className="mt-1 font-mono-code text-sm font-semibold text-zinc-100">
                {project.chains.length || "—"}
              </p>
              <p className="truncate text-[11px] text-zinc-500">
                {project.chains[0] || "Não detectada"}
              </p>
            </div>
          </div>

          {project.investors.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-zinc-500 mr-1">Investidores:</span>
              {project.investors.slice(0, 10).map((inv) => (
                <span
                  key={inv}
                  className="rounded bg-surface border border-border px-2 py-0.5 text-[11px] text-zinc-300"
                >
                  {inv}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Anexo — Canais & Links Vinculados */}
        <section className="mt-7 border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Anexo · Canais &amp; Links Vinculados ({attachedLinks.length})
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-zinc-500">
              <span className={project.twitter_url ? "text-emerald-400" : ""}>
                X {project.twitter_url ? "✓" : "—"}
              </span>
              <span className={project.telegram_url ? "text-emerald-400" : ""}>
                Telegram {project.telegram_url ? "✓" : "—"}
              </span>
              <span className={project.instagram_url ? "text-emerald-400" : ""}>
                Instagram {project.instagram_url ? "✓" : "—"}
              </span>
            </div>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {attachedLinks.map((item, idx) => (
              <a
                key={`${item.url}-${idx}`}
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs transition hover:border-zinc-600 hover:bg-elevated"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-canvas border border-border/80">
                    {renderLinkIcon(item.type)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-200">{item.label}</p>
                    <p className="truncate font-mono-code text-[11px] text-zinc-500">
                      {item.url.replace(/^https?:\/\/(www\.)?/, "")}
                    </p>
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              </a>
            ))}
          </div>
        </section>

        {/* Redes & Distribuição de TVL */}
        <section className="mt-7 border-t border-border pt-6">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
            <Layers className="h-3.5 w-3.5" />
            Redes em Operação
          </h3>

          {project.chains.length === 0 ? (
            <p className="mt-2 text-xs text-zinc-500">
              Nenhuma rede blockchain específica detectada automaticamente até o momento.
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {project.chains.map((chain) => (
                  <span
                    key={chain}
                    className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-zinc-200"
                  >
                    {chain}
                  </span>
                ))}
              </div>

              {chainTvlEntries.length > 0 && (
                <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface p-3.5">
                  <p className="text-[11px] text-zinc-500">
                    Distribuição de TVL por rede (DefiLlama)
                  </p>
                  {chainTvlEntries.slice(0, 6).map(([chainName, tvlVal]) => {
                    const share =
                      totalChainTvl > 0
                        ? Math.max(1, Math.round((tvlVal / totalChainTvl) * 100))
                        : 100;
                    return (
                      <div key={chainName}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-zinc-200">{chainName}</span>
                          <span className="font-mono-code text-zinc-400">
                            {formatUsd(tvlVal)} ({share}%)
                          </span>
                        </div>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-emerald-500/80"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Score Breakdown */}
        <section className="mt-7 border-t border-border pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Auditoria Fundamentalista (6 Pilares)
          </h3>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
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
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-300">{label}</span>
                    <span className="font-mono-code text-zinc-100">
                      {val}/{max}
                    </span>
                  </div>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bull case & Red flags */}
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-border bg-surface p-4">
              <h4 className="text-xs font-semibold text-emerald-400">
                Pontos Fortes
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-zinc-300">
                {project.bull_case.map((item, idx) => (
                  <li key={idx}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <h4 className="text-xs font-semibold text-rose-400">
                Riscos &amp; Red Flags
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-zinc-300">
                {project.red_flags.length > 0 ? (
                  project.red_flags.map((item, idx) => <li key={idx}>• {item}</li>)
                ) : (
                  <li className="text-zinc-500">Nenhum red flag crítico.</li>
                )}
              </ul>
            </div>
          </div>
        </section>

        {/* Anti-Sybil Strategic Plan */}
        <section className="mt-7 border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Plano Estratégico Anti-Sybil
            </h3>
            {project.tasks.length > 0 && (
              <span className="font-mono-code text-xs text-zinc-400">
                {completedCount}/{project.tasks.length} concluídas
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-zinc-400">{project.anti_sybil_strategy}</p>

          {project.tasks.length === 0 ? (
            <p className="mt-3 rounded-lg border border-border bg-surface p-3.5 text-xs text-zinc-400">
              Score abaixo de 70 pontos — plano de farming não recomendado.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {project.tasks.map((task) => (
                <div
                  key={task.id}
                  className={`rounded-lg border p-3.5 transition ${
                    task.completed
                      ? "border-border/60 bg-surface/50 opacity-60"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleTaskClick(task.id, task.completed)}
                      disabled={togglingTaskId === task.id}
                      className="mt-0.5 text-emerald-400 shrink-0"
                    >
                      {togglingTaskId === task.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : task.completed ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Circle className="h-4 w-4 text-zinc-600 hover:text-zinc-400" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4
                          className={`text-xs font-semibold ${
                            task.completed
                              ? "line-through text-zinc-500"
                              : "text-zinc-100"
                          }`}
                        >
                          {task.title}
                        </h4>
                        <span className="font-mono-code text-[10px] text-zinc-500">
                          {task.priority} · {task.frequency} · {task.estimated_cost_usd}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-400">
                        {task.description}
                      </p>
                      {task.anti_sybil_tip && (
                        <p className="mt-1.5 text-[11px] text-zinc-500">
                          <span className="text-zinc-300 font-medium">Dica Anti-Sybil:</span>{" "}
                          {task.anti_sybil_tip}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Roadmap Monitor */}
        <section className="mt-7 border-t border-border pt-6 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Monitor de Roadmap &amp; Docs
              </h3>
              <p className="mt-1 font-mono-code text-[11px] text-zinc-500">
                {project.monitored_url || project.url}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onToggleMonitor(!project.monitoring_enabled)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
              >
                {project.monitoring_enabled ? (
                  <>
                    <Bell className="h-3.5 w-3.5 text-emerald-400" />
                    Ativo
                  </>
                ) : (
                  <>
                    <BellOff className="h-3.5 w-3.5 text-zinc-500" />
                    Pausado
                  </>
                )}
              </button>

              <button
                onClick={handleCheckNow}
                disabled={checkingUpdate}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600 disabled:opacity-50"
              >
                {checkingUpdate ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Checar
              </button>
            </div>
          </div>

          {lastCheckMsg && (
            <p className="mt-2.5 text-xs text-emerald-400">{lastCheckMsg}</p>
          )}

          {project.roadmap_snapshots.length > 0 && (
            <div className="mt-3 space-y-2">
              {project.roadmap_snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="rounded-lg border border-border bg-surface p-3 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{formatRelativeDate(snap.detected_at)}</span>
                    <span>{snap.alert_sent ? "Telegram ✓" : "Local"}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-zinc-300">
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
