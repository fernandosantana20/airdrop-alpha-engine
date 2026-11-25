"use client";

import { useCallback, useEffect, useState } from "react";
import { Radar, Search, Send, X } from "lucide-react";
import type {
  DashboardStats,
  HealthStatus,
  ProjectDetail,
  ProjectListItem,
} from "@/types/airdrop";
import { api } from "@/lib/api";
import { AnalyzeForm } from "@/components/AnalyzeForm";
import { ProjectCard } from "@/components/ProjectCard";
import { ProjectDetailPanel } from "@/components/ProjectDetailPanel";
import { ThemeToggle } from "@/components/ThemeToggle";

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

  const [verdictFilter, setVerdictFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isRunningMonitor, setIsRunningMonitor] = useState(false);
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
    setSelectedProject(null);
    await loadData();
  };

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
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      {/* Minimal Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-fg">
            Airdrop Alpha
          </h1>
          <p className="mt-0.5 text-xs text-fg-muted">
            Due diligence Web3 · Redes · Canais oficiais · Plano Anti-Sybil
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {health && (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs text-fg-secondary">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  health.telegram_configured
                    ? "bg-emerald-500 dark:bg-emerald-400"
                    : "bg-fg-muted"
                }`}
              />
              {health.gemini_configured ? "Gemini" : "Heurístico"}
            </span>
          )}

          <button
            onClick={handleTestTelegram}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-fg-secondary transition hover:border-border-strong hover:text-fg"
          >
            <Send className="h-3.5 w-3.5" />
            Telegram
          </button>

          <button
            onClick={handleRunAllMonitors}
            disabled={isRunningMonitor}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-fg-secondary transition hover:border-border-strong hover:text-fg disabled:opacity-50"
          >
            <Radar
              className={`h-3.5 w-3.5 ${isRunningMonitor ? "animate-spin" : ""}`}
            />
            Roadmaps
          </button>

          <ThemeToggle />
        </div>
      </header>

      {/* Inline KPI Strip */}
      <section className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-border py-3 text-xs text-fg-muted">
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
          Tasks{" "}
          <strong className="ml-1 font-mono-code text-fg">
            {stats?.completed_tasks ?? 0}/{stats?.total_tasks ?? 0}
          </strong>
        </span>
        <span>
          Updates{" "}
          <strong className="ml-1 font-mono-code text-fg">
            {stats?.roadmap_alerts ?? 0}
          </strong>
        </span>
      </section>

      {/* Banner */}
      {banner && (
        <div
          className={`mt-4 flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-xs ${
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
            className="text-fg-muted hover:text-fg"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Analyze Input */}
      <section className="mt-5">
        <AnalyzeForm onAnalyze={handleAnalyze} isLoading={isAnalyzing} />
      </section>

      {/* Filter & Search */}
      <section className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1">
          {VERDICT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setVerdictFilter(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                verdictFilter === tab.id
                  ? "bg-elevated text-fg border border-border"
                  : "text-fg-muted hover:text-fg"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar projeto ou rede..."
            className="w-full rounded-lg border border-border bg-surface py-1.5 pl-8 pr-3 text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
          />
        </div>
      </section>

      {/* Grid */}
      <section className="mt-4">
        {projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-xs text-fg-muted">
            Nenhum projeto encontrado. Cole a URL de um protocolo acima para iniciar.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((proj) => (
              <ProjectCard
                key={proj.id}
                project={proj}
                onSelect={handleSelectProject}
              />
            ))}
          </div>
        )}
      </section>

      {/* Detail Drawer */}
      {selectedProject && (
        <ProjectDetailPanel
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onReanalyze={handleReanalyzeSelected}
          onSaveReferral={handleSaveReferral}
          onToggleTask={handleToggleTask}
          onToggleMonitor={handleToggleMonitor}
          onCheckUpdates={handleCheckUpdates}
          onDelete={handleDeleteProject}
        />
      )}
    </main>
  );
}
