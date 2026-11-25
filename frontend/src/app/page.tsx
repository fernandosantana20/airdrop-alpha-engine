"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  BellRing,
  CheckCircle2,
  Cpu,
  Radar,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
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

const VERDICT_TABS = [
  { id: "ALL", label: "Todos" },
  { id: "APPROVED", label: "Aprovados (≥70)" },
  { id: "WATCHLIST", label: "Watchlist (50-69)" },
  { id: "REJECTED", label: "Reprovados (<50)" },
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
      const [h, s, list] = await Promise.all([
        api.health(),
        api.stats(),
        api.listProjects({ verdict: verdictFilter, search: searchQuery }),
      ]);
      setHealth(h);
      setStats(s);
      setProjects(list);
    } catch (err) {
      setBanner({
        type: "error",
        text: `Não foi possível conectar ao backend FastAPI (${
          err instanceof Error ? err.message : "erro desconhecido"
        }). Verifique se o servidor está rodando na porta 8000.`,
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
        text: `${detail.name} auditado com score ${detail.fundamental_score}/100 (${detail.verdict}).`,
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

  const handleSelectProject = async (id: number) => {
    try {
      const detail = await api.getProject(id);
      setSelectedProject(detail);
    } catch (err) {
      setBanner({
        type: "error",
        text: `Falha ao carregar detalhes: ${
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
    setBanner({ type: "info", text: "Projeto removido do banco local." });
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
        text: `Varredura concluída em ${results.length} projeto(s). ${changedCount} alteração(ões) detectada(s).`,
      });
      await loadData();
    } catch (err) {
      setBanner({
        type: "error",
        text: `Erro ao rodar monitor: ${err instanceof Error ? err.message : "erro"}`,
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
          ? "Mensagem de teste enviada com sucesso no Telegram!"
          : `Telegram não enviado: ${res.reason}`,
      });
    } catch (err) {
      setBanner({
        type: "error",
        text: `Erro ao testar Telegram: ${err instanceof Error ? err.message : "erro"}`,
      });
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <header className="flex flex-col gap-4 border-b border-border/80 pb-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" />
            Web3 Due Diligence &amp; Anti-Sybil Engine
          </div>
          <h1 className="mt-2.5 text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
            Airdrop Alpha Engine
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Triagem fundamentalista rigorosa (0–100), plano Anti-Sybil e alertas de roadmap no Telegram.
          </p>
        </div>

        {/* Status pills & quick actions */}
        <div className="flex flex-wrap items-center gap-2">
          {health && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs ${
                health.gemini_configured
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }`}
            >
              <Cpu className="h-3.5 w-3.5" />
              {health.gemini_configured
                ? `Gemini (${health.gemini_model})`
                : "Modo Heurístico (sem GEMINI_API_KEY)"}
            </span>
          )}

          <button
            onClick={handleTestTelegram}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-cyan-500/40 hover:text-cyan-300"
          >
            <Send className="h-3.5 w-3.5" />
            Testar Telegram
          </button>

          <button
            onClick={handleRunAllMonitors}
            disabled={isRunningMonitor}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-emerald-500/40 hover:text-emerald-300 disabled:opacity-50"
          >
            <Radar
              className={`h-3.5 w-3.5 ${isRunningMonitor ? "animate-spin" : ""}`}
            />
            Checar Roadmaps
          </button>
        </div>
      </header>

      {/* Banner */}
      {banner && (
        <div
          className={`mt-5 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
            banner.type === "error"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
              : banner.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-cyan-500/30 bg-cyan-500/10 text-cyan-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{banner.text}</span>
          </div>
          <button
            onClick={() => setBanner(null)}
            className="text-xs opacity-70 hover:opacity-100"
          >
            Fechar
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <section className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Projetos Auditados</span>
            <Activity className="h-4 w-4 text-slate-500" />
          </div>
          <p className="mt-2 font-mono-code text-2xl font-bold text-slate-100">
            {stats?.total_projects ?? 0}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Alpha Aprovados (≥70)</span>
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="mt-2 font-mono-code text-2xl font-bold text-emerald-400">
            {stats?.approved_projects ?? 0}
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Tasks Anti-Sybil</span>
            <CheckCircle2 className="h-4 w-4 text-cyan-400" />
          </div>
          <p className="mt-2 font-mono-code text-2xl font-bold text-slate-100">
            {stats?.completed_tasks ?? 0}
            <span className="text-sm font-normal text-slate-500">
              /{stats?.total_tasks ?? 0}
            </span>
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface/80 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Updates de Roadmap</span>
            <BellRing className="h-4 w-4 text-amber-400" />
          </div>
          <p className="mt-2 font-mono-code text-2xl font-bold text-slate-100">
            {stats?.roadmap_alerts ?? 0}
          </p>
        </div>
      </section>

      {/* Analyze Input */}
      <section className="mt-6">
        <AnalyzeForm onAnalyze={handleAnalyze} isLoading={isAnalyzing} />
      </section>

      {/* Filters & Search */}
      <section className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface/70 p-1">
          {VERDICT_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setVerdictFilter(tab.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                verdictFilter === tab.id
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filtrar por nome, setor ou URL..."
            className="w-full rounded-xl border border-border bg-surface/80 py-2 pl-9 pr-3 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/50 focus:outline-none"
          />
        </div>
      </section>

      {/* Projects Grid */}
      <section className="mt-5">
        {projects.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-surface/40 p-12 text-center">
            <Radar className="mx-auto h-10 w-10 text-slate-600" />
            <h3 className="mt-3 text-base font-semibold text-slate-200">
              Nenhum projeto analisado ainda
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-400">
              Insira a URL de um protocolo Web3 acima (site oficial ou GitBook) para rodar
              a auditoria fundamentalista, consultar TVL/Funding no DefiLlama e gerar o
              plano Anti-Sybil.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
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

      {/* Project Detail Drawer */}
      {selectedProject && (
        <ProjectDetailPanel
          project={selectedProject}
          onClose={() => setSelectedProject(null)}
          onToggleTask={handleToggleTask}
          onToggleMonitor={handleToggleMonitor}
          onCheckUpdates={handleCheckUpdates}
          onDelete={handleDeleteProject}
        />
      )}
    </main>
  );
}
