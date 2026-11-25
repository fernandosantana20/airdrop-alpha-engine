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
      className="rounded-xl border border-border bg-surface p-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Cole a URL do projeto (ex: https://tori.finance ou https://berachain.com)"
            disabled={isLoading}
            className="w-full rounded-lg border border-transparent bg-canvas py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-700 focus:outline-none disabled:opacity-60"
            required
          />
        </div>

        <button
          type="submit"
          disabled={isLoading || !url.trim()}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
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

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-zinc-500">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="inline-flex items-center gap-1.5 transition hover:text-zinc-300"
        >
          <BookOpen className="h-3.5 w-3.5" />
          {showAdvanced ? "Ocultar URL de docs" : "+ URL manual de docs"}
        </button>

        <label className="inline-flex cursor-pointer items-center gap-1.5 hover:text-zinc-300">
          <input
            type="checkbox"
            checked={forceRefresh}
            onChange={(e) => setForceRefresh(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-zinc-700 bg-canvas accent-emerald-500"
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
            className="w-full rounded-lg border border-border bg-canvas px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none"
          />
        </div>
      )}

      {isLoading && (
        <p className="mt-2.5 px-1 text-xs text-zinc-400">
          Coletando site, redes sociais (X, Telegram, Instagram), docs, GitHub e métricas DefiLlama...
        </p>
      )}
    </form>
  );
}
