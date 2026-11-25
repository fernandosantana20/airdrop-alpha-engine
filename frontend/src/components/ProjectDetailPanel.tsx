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
  onSaveReferral: (payload: {
    user_referral_link?: string;
    waitlist_url?: string;
  }) => Promise<void>;
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
      return <Globe className="h-3.5 w-3.5 text-fg-secondary" />;
    case "twitter":
      return <span className="text-xs font-bold text-fg leading-none">𝕏</span>;
    case "telegram":
      return <Send className="h-3.5 w-3.5 text-fg-secondary" />;
    case "instagram":
      return <Instagram className="h-3.5 w-3.5 text-fg-secondary" />;
    case "discord":
      return <MessageSquare className="h-3.5 w-3.5 text-fg-secondary" />;
    case "github":
      return <GitBranch className="h-3.5 w-3.5 text-fg-secondary" />;
    case "docs":
      return <BookOpen className="h-3.5 w-3.5 text-fg-secondary" />;
    case "audit":
      return <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />;
    default:
      return <Link2 className="h-3.5 w-3.5 text-fg-secondary" />;
  }
}

export function ProjectDetailPanel({
  project,
  onClose,
  onReanalyze,
  onSaveReferral,
  onToggleTask,
  onToggleMonitor,
  onCheckUpdates,
  onDelete,
}: ProjectDetailPanelProps) {
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [refInput, setRefInput] = useState(project.user_referral_link || "");
  const [waitlistInput, setWaitlistInput] = useState(project.waitlist_url || "");
  const [savingRef, setSavingRef] = useState(false);
  const [lastCheckMsg, setLastCheckMsg] = useState<string | null>(null);
  const [togglingTaskId, setTogglingTaskId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleSaveRef = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRef(true);
    try {
      await onSaveReferral({
        user_referral_link: refInput,
        waitlist_url: waitlistInput,
      });
    } finally {
      setSavingRef(false);
    }
  };

  const handleCopyRef = async () => {
    const target = project.user_referral_link || refInput;
    if (!target) return;
    await navigator.clipboard.writeText(target);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

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
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 dark:bg-black/75 backdrop-blur-sm">
      <div className="relative h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-canvas px-6 py-6 shadow-2xl md:px-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
          <div className="flex items-center gap-4">
            <ScoreRing score={project.fundamental_score} size={64} strokeWidth={5} />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-fg">{project.name}</h2>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                    project.verdict === "APPROVED"
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : project.verdict === "WATCHLIST"
                      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                      : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                  }`}
                >
                  {project.verdict}
                </span>
              </div>
              <p className="mt-1 text-xs text-fg-muted">
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
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-fg-secondary transition hover:border-border-strong hover:text-fg"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copied ? "Copiado" : "Copiar"}
            </button>
            <button
              onClick={handleReanalyze}
              disabled={reanalyzing}
              title="Reanalisar projeto agora"
              className="rounded-lg border border-border bg-surface p-1.5 text-fg-secondary transition hover:border-border-strong hover:text-fg disabled:opacity-50"
            >
              <RefreshCw
                className={`h-4 w-4 ${reanalyzing ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Remover projeto"
              className="rounded-lg border border-border bg-surface p-1.5 text-fg-secondary transition hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-border bg-surface p-1.5 text-fg-secondary transition hover:border-border-strong hover:text-fg"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Summary & Key Telemetry */}
        <section className="mt-6">
          <p className="text-sm leading-relaxed text-fg-secondary">
            {project.executive_summary}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-[11px] text-fg-muted">TVL On-Chain</p>
              <p className="mt-1 font-mono-code text-sm font-semibold text-fg">
                {formatUsd(project.tvl_usd)}
              </p>
              {project.tvl_change_7d !== null && (
                <p
                  className={`text-[11px] font-mono-code ${
                    project.tvl_change_7d >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {project.tvl_change_7d >= 0 ? "+" : ""}
                  {project.tvl_change_7d.toFixed(1)}% (7d)
                </p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-[11px] text-fg-muted">Funding / Backers</p>
              <p className="mt-1 font-mono-code text-sm font-semibold text-fg">
                {formatUsd(project.funding_usd)}
              </p>
              <p className="truncate text-[11px] text-fg-muted">
                {project.investors.length > 0
                  ? project.investors.slice(0, 2).join(", ")
                  : "Não divulgado"}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-[11px] text-fg-muted">GitHub</p>
              <p className="mt-1 font-mono-code text-sm font-semibold text-fg">
                {project.github_stars !== null ? `${project.github_stars} ★` : "N/A"}
              </p>
              <p className="text-[11px] text-fg-muted">
                {project.github_repos_count !== null
                  ? `${project.github_repos_count} repo(s)`
                  : "Não indexado"}
              </p>
            </div>

            <div className="rounded-lg border border-border bg-surface p-3">
              <p className="text-[11px] text-fg-muted">Redes Ativas</p>
              <p className="mt-1 font-mono-code text-sm font-semibold text-fg">
                {project.chains.length || "—"}
              </p>
              <p className="truncate text-[11px] text-fg-muted">
                {project.chains[0] || "Não detectada"}
              </p>
            </div>
          </div>

          {project.investors.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-fg-muted mr-1">Investidores:</span>
              {project.investors.slice(0, 10).map((inv) => (
                <span
                  key={inv}
                  className="rounded border border-border bg-surface px-2 py-0.5 text-[11px] text-fg-secondary"
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
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Anexo · Canais &amp; Links Vinculados ({attachedLinks.length})
            </h3>
            <div className="flex items-center gap-3 text-[11px] text-fg-muted">
              <span
                className={
                  project.twitter_url
                    ? "text-emerald-600 dark:text-emerald-400 font-medium"
                    : ""
                }
              >
                X {project.twitter_url ? "✓" : "—"}
              </span>
              <span
                className={
                  project.telegram_url
                    ? "text-emerald-600 dark:text-emerald-400 font-medium"
                    : ""
                }
              >
                Telegram {project.telegram_url ? "✓" : "—"}
              </span>
              <span
                className={
                  project.instagram_url
                    ? "text-emerald-600 dark:text-emerald-400 font-medium"
                    : ""
                }
              >
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
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-xs transition hover:border-border-strong hover:bg-elevated"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-border bg-canvas">
                    {renderLinkIcon(item.type)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-fg">{item.label}</p>
                    <p className="truncate font-mono-code text-[11px] text-fg-muted">
                      {item.url.replace(/^https?:\/\/(www\.)?/, "")}
                    </p>
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-fg-muted" />
              </a>
            ))}
          </div>
        </section>

        {/* Redes & Distribuição de TVL */}
        <section className="mt-7 border-t border-border pt-6">
          <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
            <Layers className="h-3.5 w-3.5" />
            Redes em Operação
          </h3>

          {project.chains.length === 0 ? (
            <p className="mt-2 text-xs text-fg-muted">
              Nenhuma rede blockchain específica detectada automaticamente até o momento.
            </p>
          ) : (
            <div className="mt-3 space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {project.chains.map((chain) => (
                  <span
                    key={chain}
                    className="rounded-md border border-border bg-surface px-2.5 py-1 text-xs font-medium text-fg"
                  >
                    {chain}
                  </span>
                ))}
              </div>

              {chainTvlEntries.length > 0 && (
                <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface p-3.5">
                  <p className="text-[11px] text-fg-muted">
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
                          <span className="text-fg">{chainName}</span>
                          <span className="font-mono-code text-fg-secondary">
                            {formatUsd(tvlVal)} ({share}%)
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-track">
                          <div
                            className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400"
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

        {/* Waitlist & Referral */}
        <section className="mt-7 border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Waitlist &amp; Referral
            </h3>
            <div className="flex items-center gap-2 text-[11px]">
              <span
                className={`rounded px-2 py-0.5 font-medium ${
                  project.has_waitlist
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    : "bg-elevated text-fg-muted"
                }`}
              >
                {project.has_waitlist ? "Waitlist ativa" : "Sem waitlist"}
              </span>
              <span
                className={`rounded px-2 py-0.5 font-medium ${
                  project.has_referral
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-elevated text-fg-muted"
                }`}
              >
                {project.has_referral ? "Com Referral" : "Sem referral"}
              </span>
            </div>
          </div>

          {project.waitlist_notes && (
            <p className="mt-2 text-xs text-fg-secondary">{project.waitlist_notes}</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {project.waitlist_url && (
              <a
                href={project.waitlist_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg transition hover:border-border-strong"
              >
                Abrir Waitlist
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {project.referral_url && (
              <a
                href={project.referral_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-fg transition hover:border-border-strong"
              >
                Programa de Referral / Pontos
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <form
            onSubmit={handleSaveRef}
            className="mt-3 grid gap-2 rounded-lg border border-border bg-surface p-3 sm:grid-cols-2"
          >
            <div>
              <label className="block text-[11px] text-fg-muted">
                Seu link de Referral (salvo no projeto)
              </label>
              <div className="mt-1 flex gap-1.5">
                <input
                  type="text"
                  value={refInput}
                  onChange={(e) => setRefInput(e.target.value)}
                  placeholder="https://projeto.xyz?ref=SEUCODIGO"
                  className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
                />
                {(project.user_referral_link || refInput) && (
                  <button
                    type="button"
                    onClick={handleCopyRef}
                    title="Copiar seu link de referral"
                    className="rounded-md border border-border bg-canvas px-2 text-fg-secondary hover:text-fg"
                  >
                    {copiedRef ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[11px] text-fg-muted">
                Link da Waitlist (opcional)
              </label>
              <div className="mt-1 flex gap-1.5">
                <input
                  type="text"
                  value={waitlistInput}
                  onChange={(e) => setWaitlistInput(e.target.value)}
                  placeholder="https://projeto.xyz/waitlist"
                  className="w-full rounded-md border border-border bg-canvas px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={savingRef}
                  className="shrink-0 rounded-md bg-btn px-3 py-1.5 text-xs font-medium text-btn-fg transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingRef ? "..." : "Salvar"}
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* Roadmap do Projeto */}
        <section className="mt-7 border-t border-border pt-6">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Roadmap do Projeto
            </h3>
            {project.roadmap_url && (
              <a
                href={project.roadmap_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-fg-secondary hover:text-fg"
              >
                Ver fonte oficial
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>

          <p className="mt-2 text-xs text-fg-secondary">{project.roadmap_summary}</p>

          {project.roadmap_milestones && project.roadmap_milestones.length > 0 ? (
            <div className="mt-4 space-y-3 border-l border-border pl-4">
              {project.roadmap_milestones.map((m, idx) => {
                const statusDot =
                  m.status === "DONE"
                    ? "bg-emerald-500 dark:bg-emerald-400"
                    : m.status === "IN_PROGRESS"
                    ? "bg-amber-500 dark:bg-amber-400"
                    : "bg-fg-muted";
                const statusLabel =
                  m.status === "DONE"
                    ? "Concluído"
                    : m.status === "IN_PROGRESS"
                    ? "Em andamento"
                    : "Próximo";
                return (
                  <div key={idx} className="relative rounded-lg border border-border bg-surface p-3">
                    <span
                      className={`absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-canvas ${statusDot}`}
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono-code text-[11px] font-semibold text-fg-muted">
                        {m.phase}
                      </span>
                      <span className="text-[10px] font-medium text-fg-muted">
                        {statusLabel}
                      </span>
                    </div>
                    <h4 className="mt-1 text-xs font-semibold text-fg">{m.title}</h4>
                    {m.details && (
                      <p className="mt-1 text-xs text-fg-secondary">{m.details}</p>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 text-xs text-fg-muted">
              Clique no botão de reanalisar (↻) no topo para extrair as fases do roadmap deste projeto.
            </p>
          )}
        </section>

        {/* Score Breakdown */}
        <section className="mt-7 border-t border-border pt-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Auditoria Fundamentalista (6 Pilares)
          </h3>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {BREAKDOWN_META.map(({ key, label, max }) => {
              const val = project.score_breakdown?.[key] ?? 0;
              const pct = Math.min(100, Math.round((val / max) * 100));
              const barColor =
                pct >= 70
                  ? "bg-emerald-600 dark:bg-emerald-400"
                  : pct >= 45
                  ? "bg-amber-500 dark:bg-amber-400"
                  : "bg-rose-500 dark:bg-rose-400";
              return (
                <div
                  key={key}
                  className="rounded-lg border border-border bg-surface p-3"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-fg-secondary">{label}</span>
                    <span className="font-mono-code font-medium text-fg">
                      {val}/{max}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-track">
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
              <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                Pontos Fortes
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-fg-secondary">
                {project.bull_case.map((item, idx) => (
                  <li key={idx}>• {item}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg border border-border bg-surface p-4">
              <h4 className="text-xs font-semibold text-rose-600 dark:text-rose-400">
                Riscos &amp; Red Flags
              </h4>
              <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-fg-secondary">
                {project.red_flags.length > 0 ? (
                  project.red_flags.map((item, idx) => <li key={idx}>• {item}</li>)
                ) : (
                  <li className="text-fg-muted">Nenhum red flag crítico.</li>
                )}
              </ul>
            </div>
          </div>
        </section>

        {/* Anti-Sybil Strategic Plan */}
        <section className="mt-7 border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Plano Estratégico Anti-Sybil
            </h3>
            {project.tasks.length > 0 && (
              <span className="font-mono-code text-xs text-fg-secondary">
                {completedCount}/{project.tasks.length} concluídas
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-fg-secondary">{project.anti_sybil_strategy}</p>

          {project.tasks.length === 0 ? (
            <p className="mt-3 rounded-lg border border-border bg-surface p-3.5 text-xs text-fg-muted">
              Score abaixo de 70 pontos — plano de farming não recomendado.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {project.tasks.map((task) => (
                <div
                  key={task.id}
                  className={`rounded-lg border p-3.5 transition ${
                    task.completed
                      ? "border-border/60 bg-surface/60 opacity-65"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleTaskClick(task.id, task.completed)}
                      disabled={togglingTaskId === task.id}
                      className="mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0"
                    >
                      {togglingTaskId === task.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : task.completed ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <Circle className="h-4 w-4 text-fg-muted hover:text-fg" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4
                          className={`text-xs font-semibold ${
                            task.completed
                              ? "line-through text-fg-muted"
                              : "text-fg"
                          }`}
                        >
                          {task.title}
                        </h4>
                        <span className="font-mono-code text-[10px] text-fg-muted">
                          {task.priority} · {task.frequency} · {task.estimated_cost_usd}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-fg-secondary">
                        {task.description}
                      </p>
                      {task.anti_sybil_tip && (
                        <p className="mt-1.5 text-[11px] text-fg-muted">
                          <span className="font-medium text-fg">Dica Anti-Sybil:</span>{" "}
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
              <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                Monitor de Roadmap &amp; Docs
              </h3>
              <p className="mt-1 font-mono-code text-[11px] text-fg-muted">
                {project.monitored_url || project.url}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onToggleMonitor(!project.monitoring_enabled)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-fg-secondary transition hover:border-border-strong hover:text-fg"
              >
                {project.monitoring_enabled ? (
                  <>
                    <Bell className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                    Ativo
                  </>
                ) : (
                  <>
                    <BellOff className="h-3.5 w-3.5 text-fg-muted" />
                    Pausado
                  </>
                )}
              </button>

              <button
                onClick={handleCheckNow}
                disabled={checkingUpdate}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-fg-secondary transition hover:border-border-strong hover:text-fg disabled:opacity-50"
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
            <p className="mt-2.5 text-xs text-emerald-600 dark:text-emerald-400">
              {lastCheckMsg}
            </p>
          )}

          {project.roadmap_snapshots.length > 0 && (
            <div className="mt-3 space-y-2">
              {project.roadmap_snapshots.map((snap) => (
                <div
                  key={snap.id}
                  className="rounded-lg border border-border bg-surface p-3 text-xs"
                >
                  <div className="flex items-center justify-between text-[11px] text-fg-muted">
                    <span>{formatRelativeDate(snap.detected_at)}</span>
                    <span>{snap.alert_sent ? "Telegram ✓" : "Local"}</span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-line text-fg-secondary">
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
