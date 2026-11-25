"use client";

import { useState } from "react";
import { Globe, BookOpen, Loader2, Sparkles, RefreshCw } from "lucide-react";

interface AnalyzeFormProps {
  onAnalyze: (payload: {
    url: string;
    docs_url?: string;
    force_refresh?: boolean;
  }) => Promise<void>;
  isLoading: boolean;
}

export function AnalyzeForm({ onAnalyze, isLoading }: AnalyzeFormProps) {
  const [url, setUrl] = useState("");
  const [docsUrl, setDocsUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [forceRefresh, setForceRefresh] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = url.trim();
    if (!cleaned) return;
    const normalized = cleaned.startsWith("http")
      ? cleaned
      : `https://${cleaned}`;
    const normalizedDocs = docsUrl.trim()
      ? docsUrl.trim().startsWith("http")
        ? docsUrl.trim()
        : `https://${docsUrl.trim()}`
      : undefined;

    await onAnalyze({
      url: normalized,
      docs_url: normalizedDocs,
      force_refresh: forceRefresh,
    });
    setUrl("");
    setDocsUrl("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-border bg-surface/90 p-5 shadow-xl shadow-black/30 backdrop-blur"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Cole a URL oficial do projeto cripto (ex: https://hyperliquid.xyz ou https://berachain.com)"
            disabled={isLoading}
            className="w-full rounded-xl border border-border bg-canvas/80 py-3 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-500/70 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Auditando...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Executar Due Diligence
            </>
          )}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="inline-flex items-center gap-1.5 text-slate-400 transition hover:text-slate-200"
        >
          <BookOpen className="h-3.5 w-3.5" />
          {showAdvanced
            ? "Ocultar opções avançadas"
            : "Informar URL de Docs/GitBook manualmente"}
        </button>

        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={forceRefresh}
            onChange={(e) => setForceRefresh(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border bg-canvas text-emerald-500 focus:ring-emerald-500/30"
          />
          <RefreshCw className="h-3 w-3 text-slate-500" />
          Forçar reanálise se já existir
        </label>
      </div>

      {showAdvanced && (
        <div className="mt-3">
          <div className="relative">
            <BookOpen className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={docsUrl}
              onChange={(e) => setDocsUrl(e.target.value)}
              placeholder="URL opcional da documentação / GitBook (ex: https://docs.projeto.xyz)"
              disabled={isLoading}
              className="w-full rounded-xl border border-border bg-canvas/80 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/70 focus:outline-none focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>
        </div>
      )}

      {isLoading && (
        <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5 text-xs text-emerald-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          <span>
            Pipeline em execução: Scraping site &amp; docs → GitHub API →
            DefiLlama (TVL/Funding) → Auditoria Gemini 2.5 &amp; Plano Anti-Sybil...
          </span>
        </div>
      )}
    </form>
  );
}
