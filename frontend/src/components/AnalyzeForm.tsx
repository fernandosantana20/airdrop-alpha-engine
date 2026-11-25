"use client";

import { useState } from "react";
import { ArrowRight, BookOpen, Globe, Loader2, RefreshCw } from "lucide-react";

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
      className="rounded-xl border border-border bg-surface p-3 shadow-sm dark:shadow-none"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Cole a URL do projeto (ex: https://tori.finance)"
            disabled={isLoading}
            className="w-full rounded-lg border border-border bg-canvas py-2.5 pl-9 pr-3 text-base sm:text-sm text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none disabled:opacity-60"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-btn px-4 py-2.5 text-sm font-medium text-btn-fg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Analisando
            </>
          ) : (
            <>
              Analisar
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-fg-muted">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="inline-flex items-center gap-1.5 transition hover:text-fg"
        >
          <BookOpen className="h-3.5 w-3.5" />
          {showAdvanced ? "Ocultar URL de docs" : "+ URL manual de docs"}
        </button>

        <label className="inline-flex cursor-pointer items-center gap-1.5 hover:text-fg">
          <input
            type="checkbox"
            checked={forceRefresh}
            onChange={(e) => setForceRefresh(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-border bg-canvas accent-emerald-600 dark:accent-emerald-500"
          />
          <RefreshCw className="h-3 w-3" />
          Reanalisar se já existir
        </label>
      </div>

      {showAdvanced && (
        <div className="mt-2.5">
          <input
            type="text"
            value={docsUrl}
            onChange={(e) => setDocsUrl(e.target.value)}
            placeholder="URL opcional da documentação / GitBook"
            disabled={isLoading}
            className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-fg placeholder:text-fg-muted focus:border-border-strong focus:outline-none"
          />
        </div>
      )}

      {isLoading && (
        <p className="mt-2.5 px-1 text-xs text-fg-secondary">
          Coletando site, redes sociais (X, Telegram, Instagram), docs, GitHub e métricas DefiLlama...
        </p>
      )}
    </form>
  );
}
