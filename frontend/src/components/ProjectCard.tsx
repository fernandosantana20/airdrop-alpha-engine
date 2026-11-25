"use client";

import {
  BookOpen,
  Globe,
  Instagram,
  Layers,
  Send,
} from "lucide-react";
import type { ProjectListItem } from "@/types/airdrop";
import { formatUsd } from "@/lib/api";

interface ProjectCardProps {
  project: ProjectListItem;
  onSelect: (id: number) => void;
}

export function ProjectCard({ project, onSelect }: ProjectCardProps) {
  const dotColor =
    project.verdict === "APPROVED"
      ? "bg-emerald-400"
      : project.verdict === "WATCHLIST"
      ? "bg-amber-400"
      : "bg-rose-400";

  const scoreColor =
    project.fundamental_score >= 70
      ? "text-emerald-400"
      : project.fundamental_score >= 50
      ? "text-amber-400"
      : "text-rose-400";

  const verdictLabel =
    project.verdict === "APPROVED"
      ? "Aprovado"
      : project.verdict === "WATCHLIST"
      ? "Watchlist"
      : "Reprovado";

  return (
    <div
      onClick={() => onSelect(project.id)}
      className="group cursor-pointer rounded-xl border border-border bg-surface p-4 transition hover:border-zinc-600 hover:bg-elevated/60"
    >
      {/* Top row: Name + Score */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
            <h3 className="truncate text-base font-semibold text-zinc-100 group-hover:text-white">
              {project.name}
            </h3>
          </div>
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {project.category || "Web3"} · {verdictLabel}
          </p>
        </div>

        <div className="text-right shrink-0">
          <span className={`font-mono-code text-lg font-semibold ${scoreColor}`}>
            {project.fundamental_score}
          </span>
          <span className="font-mono-code text-xs text-zinc-600">/100</span>
        </div>
      </div>

      {/* Networks */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-zinc-600 shrink-0" />
        {project.chains.length > 0 ? (
          <>
            {project.chains.slice(0, 4).map((chain) => (
              <span
                key={chain}
                className="rounded bg-canvas px-2 py-0.5 text-[11px] text-zinc-300 border border-border/80"
              >
                {chain}
              </span>
            ))}
            {project.chains.length > 4 && (
              <span className="text-[11px] text-zinc-500">
                +{project.chains.length - 4}
              </span>
            )}
          </>
        ) : (
          <span className="text-[11px] text-zinc-500">Rede não especificada</span>
        )}
      </div>

      {/* Metrics */}
      <div className="mt-3.5 flex items-center justify-between border-t border-border/70 pt-3 text-xs">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-zinc-500">TVL </span>
            <span className="font-mono-code font-medium text-zinc-200">
              {formatUsd(project.tvl_usd)}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Funding </span>
            <span className="font-mono-code font-medium text-zinc-200">
              {formatUsd(project.funding_usd)}
            </span>
          </div>
        </div>

        {/* Quick social/attached link indicators */}
        <div
          className="flex items-center gap-2 text-zinc-500"
          onClick={(e) => e.stopPropagation()}
        >
          <a
            href={project.url}
            target="_blank"
            rel="noreferrer"
            title="Site Oficial"
            className="hover:text-zinc-200"
          >
            <Globe className="h-3.5 w-3.5" />
          </a>
          {project.twitter_url && (
            <a
              href={project.twitter_url}
              target="_blank"
              rel="noreferrer"
              title="X (Twitter)"
              className="font-semibold text-[11px] leading-none hover:text-zinc-200"
            >
              𝕏
            </a>
          )}
          {project.telegram_url && (
            <a
              href={project.telegram_url}
              target="_blank"
              rel="noreferrer"
              title="Telegram"
              className="hover:text-zinc-200"
            >
              <Send className="h-3.5 w-3.5" />
            </a>
          )}
          {project.instagram_url && (
            <a
              href={project.instagram_url}
              target="_blank"
              rel="noreferrer"
              title="Instagram"
              className="hover:text-zinc-200"
            >
              <Instagram className="h-3.5 w-3.5" />
            </a>
          )}
          {project.docs_url && (
            <a
              href={project.docs_url}
              target="_blank"
              rel="noreferrer"
              title="Docs"
              className="hover:text-zinc-200"
            >
              <BookOpen className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
