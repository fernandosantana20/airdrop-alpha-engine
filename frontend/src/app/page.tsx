"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpDown, Radar, Search, Send, Wallet, X } from "lucide-react";
import type {
  DashboardStats,
  HealthStatus,
  ProjectDetail,
  ProjectListItem,
} from "@/types/airdrop";
import { api, formatUsd } from "@/lib/api";
import { AnalyzeForm } from "@/components/AnalyzeForm";
import { DiscoverRadar } from "@/components/DiscoverRadar";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectDetailPanel } from "@/components/ProjectDetailPanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { WalletCheckerModal } from "@/components/WalletCheckerModal";

const VERDICT_TABS = [
  { id: "ALL", label: "Todos" },
  { id: "APPROVED", label: "Aprovados" },
  { id: "WATCHLIST", label: "Watchlist" },
  { id: "WAITLIST_REF", label: "Waitlist / Referral" },
  { id: "REJECTED", label: "Reprovados" },
] as const;

export default function DashboardPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProject, setSelectedProject] = useState<ProjectDetail | null>(null);

  const [activeView, setActiveView] = useState<"portfolio" | "discover">("portfolio");
  const [verdictFilter, setVerdictFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<
    "priority" | "date_desc" | "date_asc" | "name_asc" | "name_desc" | "tvl_desc"
  >("priority");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRunningMonitor, setIsRunningMonitor] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [banner, setBanner] = useState<{
    type: "error" | "success" | "info";
    text: string;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const apiVerdict = verdictFilter === "WAITLIST_REF" ? "ALL" : verdictFilter;
      const [h, s, list] = await Promise.all([
        api.health(),
        api.stats(),
        api.listProjects({ verdict: apiVerdict, search: searchQuery }),
      ]);
      setHealth(h);
      setStats(s);
      setProjects(
        verdictFilter === "WAITLIST_REF"
          ? list.filter((p) => p.has_waitlist || p.has_referral)
          : list
      );
    } catch (err) {
      setBanner({
        type: "error",
        text: `Erro de conexão com a API (${
          err instanceof Error ? err.message : "desconhecido"
        }).`,
      });
    }
  }, [verdictFilter, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAnalyze = async (payload: {
    url: string;
    docs_url?: string;
    force_refresh?: boolean;
  }) => {
    setIsAnalyzing(true);
    setBanner(null);
    try {
      const detail = await api.analyzeProject(payload);
      setSelectedProject(detail);
      setBanner({
        type: detail.fundamental_score >= 70 ? "success" : "info",
        text: `${detail.name}: ${detail.fundamental_score}/100 (${detail.verdict})`,
      });
      await loadData();
    } catch (err) {
      setBanner({
        type: "error",
        text: `Erro na análise: ${
          err instanceof Error ? err.message : "Falha inesperada"
        }`,
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReanalyzeSelected = async (url: string, docsUrl?: string | null) => {
    const detail = await api.analyzeProject({
      url,
      docs_url: docsUrl || undefined,
      force_refresh: true,
    });
    setSelectedProject(detail);
    await loadData();
  };

  const handleSaveReferral = async (payload: {
    user_referral_link?: string;
    waitlist_url?: string;
  }) => {
    if (!selectedProject) return;
    const updated = await api.updateReferral(selectedProject.id, payload);
    setSelectedProject(updated);
    setBanner({ type: "success", text: "Waitlist / Referral salvo com sucesso." });
    await loadData();
  };

  const handleSaveTracker = async (payload: {
    capital_invested_usd: number;
    gas_spent_usd: number;
    time_spent_hours: number;
    points_accumulated: string;
    reward_received_usd: number;
    investment_notes: string;
  }) => {
    if (!selectedProject) return;
    const updated = await api.updateTracker(selectedProject.id, payload);
    setSelectedProject(updated);
    setBanner({ type: "success", text: "Controle de capital, tempo e pontos salvo." });
    await loadData();
  };

  const handleSelectProject = async (id: number) => {
    try {
      const detail = await api.getProject(id);
      setSelectedProject(detail);
    } catch (err) {
      setBanner({
        type: "error",
        text: `Falha ao abrir projeto: ${
          err instanceof Error ? err.message : "erro"
        }`,
      });
    }
  };

  const handleToggleTask = async (taskId: number, completed: boolean) => {
    await api.toggleTask(taskId, completed);
    if (selectedProject) {
      const updated = await api.getProject(selectedProject.id);
      setSelectedProject(updated);
    }
    await loadData();
  };

  const handleToggleMonitor = async (enabled: boolean) => {
    if (!selectedProject) return;
    const updated = await api.updateMonitoring(selectedProject.id, enabled);
    setSelectedProject(updated);
    await loadData();
  };

  const handleCheckUpdates = async () => {
    if (!selectedProject) return null;
    const result = await api.checkProjectUpdates(selectedProject.id);
    const updated = await api.getProject(selectedProject.id);
    setSelectedProject(updated);
    await loadData();
    return result;
  };

  const handleDeleteProject = async (id: number) => {
    await api.deleteProject(id);
    if (selectedProject?.id === id) {
      setSelectedProject(null);
    }
    setBanner({ type: "info", text: "Projeto removido da sua lista." });
    await loadData();
  };

  const sortedProjects = useMemo(() => {
    const list = [...projects];
    switch (sortBy) {
      case "date_desc":
        return list.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      case "date_asc":
        return list.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      case "name_asc":
        return list.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      case "name_desc":
        return list.sort((a, b) => b.name.localeCompare(a.name, "pt-BR"));
      case "tvl_desc":
        return list.sort((a, b) => (b.tvl_usd ?? -1) - (a.tvl_usd ?? -1));
      case "priority":
      default:
        return list.sort((a, b) => {
          if (b.fundamental_score !== a.fundamental_score) {
            return b.fundamental_score - a.fundamental_score;
          }
          return (b.tvl_usd ?? 0) - (a.tvl_usd ?? 0);
        });
    }
  }, [projects, sortBy]);

  const handleRunAllMonitors = async () => {
    setIsRunningMonitor(true);
    setBanner(null);
    try {
      const results = await api.runAllMonitors();
      const changedCount = results.filter((r) => r.changed).length;
      setBanner({
        type: changedCount > 0 ? "success" : "info",
        text: `${results.length} projeto(s) verificados · ${changedCount} atualização(ões).`,
      });
      await loadData();
    } catch (err) {
      setBanner({
        type: "error",
        text: `Erro no monitor: ${err instanceof Error ? err.message : "erro"}`,
      });
    } finally {
      setIsRunningMonitor(false);
    }
  };

  const handleTestTelegram = async () => {
    setBanner(null);
    try {
      const res = await api.testTelegram();
      setBanner({
        type: res.sent ? "success" : "info",
        text: res.sent
          ? "Alerta de teste enviado no Telegram."
          : `Telegram: ${res.reason}`,
      });
    } catch (err) {
      setBanner({
        type: "error",
        text: `Erro no Telegram: ${err instanceof Error ? err.message : "erro"}`,
      });
    }
  };

  return (
    <div className="min-h-[100dvh] w-full pb-12">
      {/* Floating Top Navbar — Full Fluid Responsive Width */}
      <div className="sticky top-0 z-40 w-full px-2.5 pt-2 sm:px-5 sm:pt-3 lg:px-8 xl:px-10">
        <header className="mx-auto flex w-full max-w-[1800px] items-center justify-between gap-2 rounded-2xl border border-border bg-surface/90 px-3 py-2.5 shadow-sm backdrop-blur-md sm:px-4">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                health?.telegram_configured
                  ? "bg-emerald-500 dark:bg-emerald-400"
                  : "bg-fg-muted"
              }`}
              title={
                health?.telegram_configured
                  ? "Telegram conectado"
                  : "Telegram desconectado"
              }
            />
            <div className="min-w-0">
              <h1 className="truncate text-sm font-semibold tracking-tight text-fg sm:text-base">
                Airdrop Alpha
              </h1>
              <p className="hidden text-[11px] text-fg-muted md:block">
                Due diligence Web3 · Redes · Canais · Roadmap · Anti-Sybil
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {health && (
              <span className="hidden md:inline-flex h-8 items-center rounded-lg border border-border bg-canvas/80 px-2.5 text-xs text-fg-secondary">
                {health.gemini_configured ? "Gemini" : "Heurístico"}
              </span>
            )}

            <button
              onClick={() => setShowWalletModal(true)}
              title="Verificar saúde Anti-Sybil da sua carteira EVM"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-canvas/80 px-2.5 text-xs text-fg-secondary transition hover:border-border-strong hover:text-fg"
            >
              <Wallet className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Carteira</span>
            </button>

            <button
              onClick={handleTestTelegram}
              title="Testar alerta no Telegram"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-canvas/80 px-2.5 text-xs text-fg-secondary transition hover:border-border-strong hover:text-fg"
            >
              <Send className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Telegram</span>
            </button>

            <button
              onClick={handleRunAllMonitors}
              disabled={isRunningMonitor}
              title="Verificar atualizações de roadmaps"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-canvas/80 px-2.5 text-xs text-fg-secondary transition hover:border-border-strong hover:text-fg disabled:opacity-50"
            >
              <Radar
                className={`h-3.5 w-3.5 shrink-0 ${
                  isRunningMonitor ? "animate-spin" : ""
                }`}
              />
              <span className="hidden sm:inline">Roadmaps</span>
            </button>

            <ThemeToggle />
          </div>
        </header>
      </div>

      {/* Main Content — Full Fluid Responsive Width */}
      <main className="mx-auto w-full max-w-[1800px] px-2.5 pt-4 sm:px-5 sm:pt-6 lg:px-8 xl:px-10">
        {/* Top View Switch + Inline KPI Strip */}
        <section className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex self-start rounded-xl border border-border bg-surface p-1">
            <button
              onClick={() => setActiveView("portfolio")}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                activeView === "portfolio"
                  ? "bg-btn text-btn-fg"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              Meus Projetos
            </button>
            <button
              onClick={() => setActiveView("discover")}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                activeView === "discover"
                  ? "bg-btn text-btn-fg"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              Descobrir Alpha
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-fg-muted">
            <span>
              Auditados{" "}
              <strong className="ml-1 font-mono-code text-fg">
                {stats?.total_projects ?? 0}
              </strong>
            </span>
            <span>
              Aprovados{" "}
              <strong className="ml-1 font-mono-code text-emerald-600 dark:text-emerald-400">
                {stats?.approved_projects ?? 0}
              </strong>
            </span>
            <span>
              Capital{" "}
              <strong className="ml-1 font-mono-code text-fg">
                {formatUsd(stats?.total_capital_usd ?? 0)}
              </strong>
            </span>
            <span>
              Tempo{" "}
              <strong className="ml-1 font-mono-code text-fg">
                {(stats?.total_hours ?? 0).toFixed(1)}h
              </strong>
            </span>
            <span>
              Líquido{" "}
              <strong
                className={`ml-1 font-mono-code ${
                  (stats?.net_roi_usd ?? 0) > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : (stats?.net_roi_usd ?? 0) < 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-fg"
                }`}
              >
                {(stats?.net_roi_usd ?? 0) >= 0 ? "+" : "-"}$
                {Math.abs(stats?.net_roi_usd ?? 0).toFixed(0)}
              </strong>
            </span>
          </div>
        </section>

        {/* Banner */}
        {banner && (
          <div
            className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-xs ${
              banner.type === "error"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                : banner.type === "success"
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-border bg-surface text-fg-secondary"
            }`}
          >
            <span>{banner.text}</span>
            <button
              onClick={() => setBanner(null)}
              className="text-fg-muted hover:text-fg shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {activeView === "discover" ? (
          <div className="mt-4">
            <DiscoverRadar
              onAnalyzeUrl={async (url) => {
                await handleAnalyze({ url, force_refresh: true });
                setActiveView("portfolio");
              }}
            />
          </div>
        ) : (
          <>
            {/* Analyze Input */}
            <section className="mt-4">
              <AnalyzeForm onAnalyze={handleAnalyze} isLoading={isAnalyzing} />
            </section>

            {/* Filter Tabs (Horizontally Scrollable on Mobile) & Sort/Search */}
            <section className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                {VERDICT_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setVerdictFilter(tab.id)}
                    className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                      verdictFilter === tab.id
                        ? "border border-border bg-elevated text-fg"
                        : "text-fg-muted hover:text-fg"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex items-center">
                  <ArrowUpDown className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-fg-muted" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    aria-label="Ordenar projetos"
                    className="w-full sm:w-auto appearance-none rounded-lg border border-border bg-surface py-2 pl-8 pr-7 text-base sm:text-xs text-fg focus:border-border-strong focus:outline-none"
                  >
                    <option value="priority">Prioridade (Score)</option>
                    <option value="date_desc">Data (Mais recentes)</option>
                    <option value="date_asc">Data (Mais antigos)</option>
                    <option value="name_asc">Nome (A → Z)</option>
                    <option value="name_desc">Nome (Z → A)</option>
                    <option value="tvl_desc">Maior TVL</option>
                  </select>
                </div>

                <div className="relative w-full sm:w-56">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Buscar projeto ou rede..."
                    className="w-full rounded-lg border border-border bg-surface py-2 pl-8 pr-3 text-base sm:text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
                  />
                </div>
              </div>
            </section>

            {/* Responsive Grid */}
            <section className="mt-4">
              {sortedProjects.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border p-10 text-center text-xs text-fg-muted">
                  Nenhum projeto encontrado. Cole a URL de um protocolo acima ou abra &ldquo;Descobrir Alpha&rdquo;.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {sortedProjects.map((proj) => (
                    <ProjectCard
                      key={proj.id}
                      project={proj}
                      onSelect={handleSelectProject}
                      onDelete={handleDeleteProject}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* Full-Screen Project Detail View */}
      {selectedProject && (
        <ProjectDetailPanel
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onReanalyze={handleReanalyzeSelected}
          onSaveReferral={handleSaveReferral}
          onSaveTracker={handleSaveTracker}
          onToggleTask={handleToggleTask}
          onToggleMonitor={handleToggleMonitor}
          onCheckUpdates={handleCheckUpdates}
          onDelete={handleDeleteProject}
        />
      )}

      {/* On-Demand Anti-Sybil Wallet Health Modal */}
      {showWalletModal && (
        <WalletCheckerModal onClose={() => setShowWalletModal(false)} />
      )}
    </div>
  );
}
