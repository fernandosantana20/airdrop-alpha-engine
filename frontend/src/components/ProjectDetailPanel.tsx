"use client";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
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
} from "lucide-react";
import type { EcosystemLink, MonitorCheckResult, ProjectDetail } from "@/types/airdrop";
import { formatRelativeDate, formatUsd } from "@/lib/api";
import { ScoreRing } from "./ScoreRing";
import { ThemeToggle } from "./ThemeToggle";
import { TokenomicsPieChart } from "./TokenomicsPieChart";

interface ProjectDetailPanelProps {
  project: ProjectDetail;
  onClose: () => void;
  onReanalyze: (url: string, docsUrl?: string | null) => Promise<void>;
  onSaveReferral: (payload: {
    user_referral_link?: string;
    waitlist_url?: string;
  }) => Promise<void>;
  onSaveTracker: (payload: {
    capital_invested_usd: number;
    gas_spent_usd: number;
    time_spent_hours: number;
    points_accumulated: string;
    reward_received_usd: number;
    investment_notes: string;
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
  const milestoneLines = (project.roadmap_milestones || []).map(
    (m) => `- **${m.phase} · ${m.title}** (${m.status})${m.details ? ` — ${m.details}` : ""}`
  );
  const taskLines = project.tasks.map(
    (t) => `- [${t.completed ? "x" : " "}] **${t.title}** (${t.priority} | ${t.frequency}) — ${t.description}`
  );

  return [
    `# ${project.name} — Due Diligence (${project.fundamental_score}/100 · ${project.verdict})`,
    ``,
    `**Setor:** ${project.category || "Web3"} | **Redes:** ${chainsStr}`,
    `**TVL:** ${formatUsd(project.tvl_usd)} | **Funding:** ${formatUsd(project.funding_usd)} | **Backers:** ${project.investors.join(", ") || "N/A"}`,
    ...(project.user_referral_link ? [`**Meu Referral:** ${project.user_referral_link}`] : []),
    ``,
    `## Resumo Executivo`,
    project.executive_summary,
    ``,
    `## Anexo — Canais & Links Vinculados`,
    ...(linkLines.length > 0 ? linkLines : [`- Site: ${project.url}`]),
    ...(chainTvlLines.length > 0 ? ["", "## TVL por Rede", ...chainTvlLines] : []),
    ...(milestoneLines.length > 0 ? ["", "## Roadmap", ...milestoneLines] : []),
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
  onSaveTracker,
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
  const [capitalInput, setCapitalInput] = useState(String(project.capital_invested_usd || 0));
  const [gasInput, setGasInput] = useState(String(project.gas_spent_usd || 0));
  const [hoursInput, setHoursInput] = useState(String(project.time_spent_hours || 0));
  const [pointsInput, setPointsInput] = useState(project.points_accumulated || "");
  const [rewardInput, setRewardInput] = useState(String(project.reward_received_usd || 0));
  const [notesInput, setNotesInput] = useState(project.investment_notes || "");
  const [savingTracker, setSavingTracker] = useState(false);
  const [lastCheckMsg, setLastCheckMsg] = useState<string | null>(null);
  const [togglingTaskId, setTogglingTaskId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Sync inputs when project updates & lock background scroll
  useEffect(() => {
    setRefInput(project.user_referral_link || "");
    setWaitlistInput(project.waitlist_url || "");
    setCapitalInput(String(project.capital_invested_usd || 0));
    setGasInput(String(project.gas_spent_usd || 0));
    setHoursInput(String(project.time_spent_hours || 0));
    setPointsInput(project.points_accumulated || "");
    setRewardInput(String(project.reward_received_usd || 0));
    setNotesInput(project.investment_notes || "");
  }, [
    project.id,
    project.user_referral_link,
    project.waitlist_url,
    project.capital_invested_usd,
    project.gas_spent_usd,
    project.time_spent_hours,
    project.points_accumulated,
    project.reward_received_usd,
    project.investment_notes,
  ]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

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

  const handleSaveTracker = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingTracker(true);
    try {
      await onSaveTracker({
        capital_invested_usd: Math.max(0, parseFloat(capitalInput) || 0),
        gas_spent_usd: Math.max(0, parseFloat(gasInput) || 0),
        time_spent_hours: Math.max(0, parseFloat(hoursInput) || 0),
        points_accumulated: pointsInput,
        reward_received_usd: Math.max(0, parseFloat(rewardInput) || 0),
        investment_notes: notesInput,
      });
    } finally {
      setSavingTracker(false);
    }
  };

  const netProfitUsd =
    (parseFloat(rewardInput) || 0) - (parseFloat(gasInput) || 0);
  const usdPerHour =
    (parseFloat(hoursInput) || 0) > 0
      ? netProfitUsd / (parseFloat(hoursInput) || 1)
      : null;

  const handleCopyRef = async () => {
    const target = project.user_referral_link || refInput;
    if (!target) return;
    await navigator.clipboard.writeText(target);
    setCopiedRef(true);
    setTimeout(() => setCopiedRef(false), 2000);
  };

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
    <div className="fixed inset-0 z-50 h-[100dvh] w-full overflow-y-auto bg-canvas">
      {/* Floating Sticky Top Bar */}
      <div className="sticky top-0 z-30 px-3 pt-2 sm:px-6 sm:pt-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 rounded-2xl border border-border bg-surface/90 px-3 py-2 shadow-sm backdrop-blur-md sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              onClick={onClose}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-canvas/80 px-2.5 text-xs font-medium text-fg-secondary transition hover:border-border-strong hover:text-fg shrink-0"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span className="hidden xs:inline sm:inline">Voltar</span>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-fg sm:text-base">
                  {project.name}
                </h2>
                <span
                  className={`hidden sm:inline-block rounded-md px-2 py-0.5 text-[10px] font-medium shrink-0 ${
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
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={handleCopyDossier}
              title="Copiar dossiê completo em Markdown"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-canvas/80 px-2.5 text-xs text-fg-secondary transition hover:border-border-strong hover:text-fg"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{copied ? "Copiado" : "Copiar"}</span>
            </button>

            <button
              onClick={handleReanalyze}
              disabled={reanalyzing}
              title="Reanalisar projeto"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-canvas/80 text-fg-secondary transition hover:border-border-strong hover:text-fg disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reanalyzing ? "animate-spin" : ""}`} />
            </button>

            <ThemeToggle />

            <button
              onClick={handleDelete}
              disabled={deleting}
              title="Remover projeto"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-canvas/80 text-fg-secondary transition hover:border-rose-500/40 hover:text-rose-600 dark:hover:text-rose-400 disabled:opacity-50"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Full-Width Responsive Body */}
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        {/* Hero Overview */}
        <section className="rounded-2xl border border-border bg-surface p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <ScoreRing score={project.fundamental_score} size={72} strokeWidth={6} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold text-fg sm:text-2xl">
                    {project.name}
                  </h1>
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

            {project.investors.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {project.investors.slice(0, 6).map((inv) => (
                  <span
                    key={inv}
                    className="rounded-md border border-border bg-canvas px-2 py-0.5 text-[11px] text-fg-secondary"
                  >
                    {inv}
                  </span>
                ))}
              </div>
            )}
          </div>

          <p className="mt-4 text-sm leading-relaxed text-fg-secondary">
            {project.executive_summary}
          </p>

          <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-xl border border-border bg-canvas p-3">
              <p className="text-[11px] text-fg-muted">TVL On-Chain</p>
              <p className="mt-1 font-mono-code text-base font-semibold text-fg">
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

            <div className="rounded-xl border border-border bg-canvas p-3">
              <p className="text-[11px] text-fg-muted">Funding / Backers</p>
              <p className="mt-1 font-mono-code text-base font-semibold text-fg">
                {formatUsd(project.funding_usd)}
              </p>
              <p className="truncate text-[11px] text-fg-muted">
                {project.investors.length > 0
                  ? project.investors.slice(0, 2).join(", ")
                  : "Não divulgado"}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-canvas p-3">
              <p className="text-[11px] text-fg-muted">GitHub</p>
              <p className="mt-1 font-mono-code text-base font-semibold text-fg">
                {project.github_stars !== null ? `${project.github_stars} ★` : "N/A"}
              </p>
              <p className="text-[11px] text-fg-muted">
                {project.github_repos_count !== null
                  ? `${project.github_repos_count} repo(s)`
                  : "Não indexado"}
              </p>
            </div>

            <div className="rounded-xl border border-border bg-canvas p-3">
              <p className="text-[11px] text-fg-muted">Redes Ativas</p>
              <p className="mt-1 font-mono-code text-base font-semibold text-fg">
                {project.chains.length || "—"}
              </p>
              <p className="truncate text-[11px] text-fg-muted">
                {project.chains[0] || "Não detectada"}
              </p>
            </div>
          </div>
        </section>

        {/* Top Analytics Row: Tokenomics Pie Chart + 5 Airdrop Hunting Platforms */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <TokenomicsPieChart
            tokenomics={project.deep_metrics?.tokenomics}
            tokenSymbol={project.deep_metrics?.token_symbol}
          />

          <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  Ranking em Plataformas de Airdrop
                </h3>
                <p className="mt-0.5 text-[11px] text-fg-muted">
                  CryptoRank · DropsTab · Alpha Drops · DappRadar · Airdrops.io
                </p>
              </div>
              <span className="rounded-md border border-border bg-canvas px-2 py-0.5 font-mono-code text-[11px] font-semibold text-fg">
                {project.deep_metrics?.ranked_platforms_count ?? 0}/5 confirmados
              </span>
            </div>

            {project.deep_metrics?.airdrop_platforms &&
            project.deep_metrics.airdrop_platforms.length > 0 ? (
              <div className="mt-3.5 space-y-2">
                {project.deep_metrics.airdrop_platforms.map((plat) => {
                  const badgeStyle =
                    plat.listed === true
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : plat.listed === false
                      ? "bg-elevated text-fg-muted"
                      : "bg-amber-500/15 text-amber-700 dark:text-amber-400";
                  return (
                    <a
                      key={plat.key}
                      href={plat.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-canvas px-3 py-2 text-xs transition hover:border-border-strong hover:bg-elevated"
                    >
                      <span className="truncate font-medium text-fg">
                        {plat.platform}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-semibold ${badgeStyle}`}
                        >
                          {plat.status_label}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 text-fg-muted" />
                      </span>
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-xs text-fg-muted">
                Clique em reanalisar (↻) no topo para verificar este projeto nas 5 plataformas de mineração de airdrops.
              </p>
            )}
          </section>
        </div>

        {/* Responsive 2-Column Layout on Desktop, Stacked on Mobile */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* LEFT COLUMN (7 cols on desktop): Provenance, Audit, Roadmap, Anti-Sybil */}
          <div className="space-y-6 lg:col-span-7">
            {/* Deep Provenance & Profitability Audit */}
            {project.deep_metrics &&
              Object.keys(project.deep_metrics).length > 0 && (
                <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                      Procedência, Segurança &amp; Rentabilidade
                    </h3>
                    {project.deep_metrics.profitability_rating && (
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                          project.deep_metrics.profitability_rating === "ALTA"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : project.deep_metrics.profitability_rating === "MÉDIA"
                            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                            : "bg-rose-500/15 text-rose-700 dark:text-rose-400"
                        }`}
                      >
                        Rentabilidade: {project.deep_metrics.profitability_rating}
                      </span>
                    )}
                  </div>

                  {project.deep_metrics.asymmetry_summary && (
                    <p className="mt-2 text-xs leading-relaxed text-fg-secondary">
                      {project.deep_metrics.asymmetry_summary}
                    </p>
                  )}

                  {/* Entry Model / Capital / Revenue / Domain Age */}
                  <div className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <div className="rounded-xl border border-border bg-canvas p-3">
                      <p className="text-[11px] text-fg-muted">Modelo</p>
                      <p className="mt-1 text-xs font-semibold text-fg">
                        {project.deep_metrics.cost_model === "FREE_TESTNET"
                          ? "Gratuito / Testnet"
                          : project.deep_metrics.cost_model === "HYBRID"
                          ? "Híbrido"
                          : "Exige Capital"}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-fg-muted">
                        {project.deep_metrics.estimated_min_capital_usd || "—"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-canvas p-3">
                      <p className="text-[11px] text-fg-muted">Fees (30d)</p>
                      <p className="mt-1 font-mono-code text-xs font-semibold text-fg">
                        {formatUsd(project.deep_metrics.fees_30d_usd)}
                      </p>
                      <p className="mt-0.5 font-mono-code text-[10px] text-fg-muted">
                        24h: {formatUsd(project.deep_metrics.fees_24h_usd)}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-canvas p-3">
                      <p className="text-[11px] text-fg-muted">Idade Domínio</p>
                      <p className="mt-1 font-mono-code text-xs font-semibold text-fg">
                        {project.deep_metrics.domain_age_days != null
                          ? `${project.deep_metrics.domain_age_days} dias`
                          : "N/A"}
                      </p>
                      <p className="mt-0.5 font-mono-code text-[10px] text-fg-muted">
                        {project.deep_metrics.domain_created_at || "RDAP indisponível"}
                      </p>
                    </div>

                    <div className="rounded-xl border border-border bg-canvas p-3">
                      <p className="text-[11px] text-fg-muted">Diluição / Hacks</p>
                      <p className="mt-1 text-xs font-semibold text-fg">
                        {project.deep_metrics.saturation_risk || "—"}
                      </p>
                      <p
                        className={`mt-0.5 text-[10px] font-medium ${
                          (project.deep_metrics.hacks_count ?? 0) > 0
                            ? "text-rose-600 dark:text-rose-400"
                            : "text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {(project.deep_metrics.hacks_count ?? 0) > 0
                          ? `${project.deep_metrics.hacks_count} hack(s)`
                          : "0 hacks"}
                      </p>
                    </div>
                  </div>

                  {/* Historical Hacks Alert if any */}
                  {project.deep_metrics.hacks_history &&
                    project.deep_metrics.hacks_history.length > 0 && (
                      <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
                        <p className="font-semibold">
                          Alerta de Segurança — Histórico de Exploit Registrado:
                        </p>
                        <ul className="mt-1 space-y-1">
                          {project.deep_metrics.hacks_history.map((h, i) => (
                            <li key={i}>
                              • {h.date || "Data N/A"} — {formatUsd(h.amount_usd)} ({h.classification} · {h.technique})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* 7-Point Provenance Verification Checklist */}
                  {project.deep_metrics.provenance_checks &&
                    project.deep_metrics.provenance_checks.length > 0 && (
                      <div className="mt-4 space-y-1.5">
                        {project.deep_metrics.provenance_checks.map((chk, idx) => {
                          const badgeStyle =
                            chk.status === "PASS"
                              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                              : chk.status === "WARN"
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                              : "bg-rose-500/15 text-rose-700 dark:text-rose-400";
                          const symbol =
                            chk.status === "PASS"
                              ? "OK"
                              : chk.status === "WARN"
                              ? "ATENÇÃO"
                              : "RISCO";
                          return (
                            <div
                              key={idx}
                              className="flex items-start justify-between gap-3 rounded-xl border border-border bg-canvas px-3 py-2 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-medium text-fg">{chk.label}</p>
                                <p className="mt-0.5 text-[11px] text-fg-secondary">
                                  {chk.detail}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badgeStyle}`}
                              >
                                {symbol}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                </section>
              )}

            {/* Score Breakdown */}
            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
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
                      className="rounded-xl border border-border bg-canvas p-3"
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

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-canvas p-4">
                  <h4 className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Pontos Fortes
                  </h4>
                  <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-fg-secondary">
                    {project.bull_case.map((item, idx) => (
                      <li key={idx}>• {item}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-border bg-canvas p-4">
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

            {/* Roadmap do Projeto */}
            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
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
                    Fonte oficial
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
                      <div
                        key={idx}
                        className="relative rounded-xl border border-border bg-canvas p-3"
                      >
                        <span
                          className={`absolute -left-[21px] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-surface ${statusDot}`}
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
                  Clique em reanalisar (↻) no topo para extrair as fases do roadmap.
                </p>
              )}
            </section>

            {/* Plano Estratégico Anti-Sybil */}
            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
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
              <p className="mt-2 text-xs text-fg-secondary">
                {project.anti_sybil_strategy}
              </p>

              {project.tasks.length === 0 ? (
                <p className="mt-3 rounded-xl border border-border bg-canvas p-3.5 text-xs text-fg-muted">
                  Score abaixo de 70 pontos — plano de farming não recomendado.
                </p>
              ) : (
                <div className="mt-3 space-y-2">
                  {project.tasks.map((task) => (
                    <div
                      key={task.id}
                      className={`rounded-xl border p-3.5 transition ${
                        task.completed
                          ? "border-border/60 bg-canvas/60 opacity-65"
                          : "border-border bg-canvas"
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
                              <span className="font-medium text-fg">Anti-Sybil:</span>{" "}
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
          </div>

          {/* RIGHT COLUMN (5 cols on desktop): Anexo Links, Redes, Waitlist/Referral, Monitor */}
          <div className="space-y-6 lg:col-span-5">
            {/* Anexo — Canais & Links Vinculados */}
            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  Anexo · Links ({attachedLinks.length})
                </h3>
                <div className="flex items-center gap-2.5 text-[11px] text-fg-muted">
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
                    TG {project.telegram_url ? "✓" : "—"}
                  </span>
                  <span
                    className={
                      project.instagram_url
                        ? "text-emerald-600 dark:text-emerald-400 font-medium"
                        : ""
                    }
                  >
                    IG {project.instagram_url ? "✓" : "—"}
                  </span>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {attachedLinks.map((item, idx) => (
                  <a
                    key={`${item.url}-${idx}`}
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-canvas px-3 py-2 text-xs transition hover:border-border-strong hover:bg-elevated"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
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

            {/* Redes em Operação */}
            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-fg-muted">
                <Layers className="h-3.5 w-3.5" />
                Redes em Operação
              </h3>

              {project.chains.length === 0 ? (
                <p className="mt-2 text-xs text-fg-muted">
                  Nenhuma rede blockchain específica detectada automaticamente.
                </p>
              ) : (
                <div className="mt-3 space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {project.chains.map((chain) => (
                      <span
                        key={chain}
                        className="rounded-md border border-border bg-canvas px-2.5 py-1 text-xs font-medium text-fg"
                      >
                        {chain}
                      </span>
                    ))}
                  </div>

                  {chainTvlEntries.length > 0 && (
                    <div className="space-y-2 rounded-xl border border-border bg-canvas p-3.5">
                      <p className="text-[11px] text-fg-muted">
                        Distribuição de TVL por rede
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
            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  Waitlist &amp; Referral
                </h3>
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className={`rounded px-2 py-0.5 font-medium ${
                      project.has_waitlist
                        ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        : "bg-elevated text-fg-muted"
                    }`}
                  >
                    {project.has_waitlist ? "Waitlist" : "Sem waitlist"}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 font-medium ${
                      project.has_referral
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : "bg-elevated text-fg-muted"
                    }`}
                  >
                    {project.has_referral ? "Referral" : "Sem referral"}
                  </span>
                </div>
              </div>

              {project.waitlist_notes && (
                <p className="mt-2 text-xs text-fg-secondary">{project.waitlist_notes}</p>
              )}

              {(project.waitlist_url || project.referral_url) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {project.waitlist_url && (
                    <a
                      href={project.waitlist_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-canvas px-3 py-1.5 text-xs font-medium text-fg transition hover:border-border-strong"
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
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-canvas px-3 py-1.5 text-xs font-medium text-fg transition hover:border-border-strong"
                    >
                      Programa de Referral
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}

              <form onSubmit={handleSaveRef} className="mt-3 space-y-2.5">
                <div>
                  <label className="block text-[11px] text-fg-muted">
                    Seu link de Referral
                  </label>
                  <div className="mt-1 flex gap-1.5">
                    <input
                      type="text"
                      value={refInput}
                      onChange={(e) => setRefInput(e.target.value)}
                      placeholder="https://projeto.xyz?ref=SEUCODIGO"
                      className="w-full rounded-lg border border-border bg-canvas px-2.5 py-2 text-base sm:text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
                    />
                    {(project.user_referral_link || refInput) && (
                      <button
                        type="button"
                        onClick={handleCopyRef}
                        title="Copiar link de referral"
                        className="rounded-lg border border-border bg-canvas px-2.5 text-fg-secondary hover:text-fg"
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
                      className="w-full rounded-lg border border-border bg-canvas px-2.5 py-2 text-base sm:text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={savingRef}
                      className="shrink-0 rounded-lg bg-btn px-3 py-2 text-xs font-medium text-btn-fg transition hover:opacity-90 disabled:opacity-50"
                    >
                      {savingRef ? "..." : "Salvar"}
                    </button>
                  </div>
                </div>
              </form>
            </section>

            {/* Meu Controle — Dinheiro, Tempo, Pontos & ROI */}
            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                  Meu Controle · Capital, Tempo &amp; Pontos
                </h3>
                <span
                  className={`font-mono-code text-xs font-semibold ${
                    netProfitUsd > 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : netProfitUsd < 0
                      ? "text-rose-600 dark:text-rose-400"
                      : "text-fg-muted"
                  }`}
                >
                  Líquido: {netProfitUsd >= 0 ? "+" : "-"}$
                  {Math.abs(netProfitUsd).toFixed(2)}
                  {usdPerHour !== null && ` ($${usdPerHour.toFixed(1)}/h)`}
                </span>
              </div>

              <form onSubmit={handleSaveTracker} className="mt-3 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-fg-muted">
                      Capital alocado ($)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={capitalInput}
                      onChange={(e) => setCapitalInput(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 font-mono-code text-base sm:text-xs text-fg focus:border-border-strong focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-fg-muted">
                      Gas / Taxas ($)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={gasInput}
                      onChange={(e) => setGasInput(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 font-mono-code text-base sm:text-xs text-fg focus:border-border-strong focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-fg-muted">
                      Tempo investido (h)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={hoursInput}
                      onChange={(e) => setHoursInput(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 font-mono-code text-base sm:text-xs text-fg focus:border-border-strong focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-fg-muted">
                      Retorno recebido ($)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={rewardInput}
                      onChange={(e) => setRewardInput(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 font-mono-code text-base sm:text-xs text-fg focus:border-border-strong focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-fg-muted">
                    Pontos / XP / Tier acumulado
                  </label>
                  <input
                    type="text"
                    value={pointsInput}
                    onChange={(e) => setPointsInput(e.target.value)}
                    placeholder="ex: 14.500 XP · Season 2"
                    className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-base sm:text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-fg-muted">
                    Anotações (carteira, datas, estratégia)
                  </label>
                  <textarea
                    rows={2}
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    placeholder="Ex: Wallet #2, LP ETH/USDC desde 10/11..."
                    className="mt-1 w-full rounded-lg border border-border bg-canvas px-2.5 py-1.5 text-base sm:text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={savingTracker}
                  className="w-full rounded-lg bg-btn px-3 py-2 text-xs font-medium text-btn-fg transition hover:opacity-90 disabled:opacity-50"
                >
                  {savingTracker ? "Salvando..." : "Salvar Controle"}
                </button>
              </form>
            </section>

            {/* Monitor de Roadmap & Docs */}
            <section className="rounded-2xl border border-border bg-surface p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
                    Monitor de Updates
                  </h3>
                  <p className="mt-1 truncate font-mono-code text-[11px] text-fg-muted">
                    {project.monitored_url || project.url}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onToggleMonitor(!project.monitoring_enabled)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-canvas px-2.5 text-xs text-fg-secondary transition hover:border-border-strong hover:text-fg"
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
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-canvas px-2.5 text-xs text-fg-secondary transition hover:border-border-strong hover:text-fg disabled:opacity-50"
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
                      className="rounded-xl border border-border bg-canvas p-3 text-xs"
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
      </div>
    </div>
  );
}
