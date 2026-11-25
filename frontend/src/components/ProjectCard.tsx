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
      ? "bg-emerald-500 dark:bg-emerald-400"
      : project.verdict === "WATCHLIST"
      ? "bg-amber-500 dark:bg-amber-400"
      : "bg-rose-500 dark:bg-rose-400";

  const scoreColor =
    project.fundamental_score >= 70
      ? "text-emerald-600 dark:text-emerald-400"
      : project.fundamental_score >= 50
      ? "text-amber-600 dark:text-amber-400"
      : "text-rose-600 dark:text-rose-400";

  const verdictLabel =
    project.verdict === "APPROVED"
      ? "Aprovado"
      : project.verdict === "WATCHLIST"
      ? "Watchlist"
      : "Reprovado";

  return (
    <div
      onClick={() => onSelect(project.id)}
      className="group cursor-pointer rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-border-strong hover:bg-elevated/60 dark:shadow-none"
    >
      {/* Top row: Name + Score */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
            <h3 className="truncate text-base font-semibold text-fg">
              {project.name}
            </h3>
          </div>
          <p className="mt-0.5 truncate text-xs text-fg-muted">
            {project.category || "Web3"} · {verdictLabel}
          </p>
        </div>

        <div className="text-right shrink-0">
          <span className={`font-mono-code text-lg font-semibold ${scoreColor}`}>
            {project.fundamental_score}
          </span>
          <span className="font-mono-code text-xs text-fg-muted">/100</span>
        </div>
      </div>

      {/* Networks & Waitlist/Referral badges */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Layers className="h-3.5 w-3.5 text-fg-muted shrink-0" />
        {project.chains.length > 0 ? (
          <>
            {project.chains.slice(0, 3).map((chain) => (
              <span
                key={chain}
                className="rounded border border-border bg-canvas px-2 py-0.5 text-[11px] text-fg-secondary"
              >
                {chain}
              </span>
            ))}
            {project.chains.length > 3 && (
              <span className="text-[11px] text-fg-muted">
                +{project.chains.length - 3}
              </span>
            )}
          </>
        ) : (
          <span className="text-[11px] text-fg-muted">Rede não especificada</span>
        )}
        {project.has_waitlist && (
          <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
            Waitlist
          </span>
        )}
        {project.has_referral && (
          <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
            Referral
          </span>
        )}
      </div>

      {/* Metrics & Quick Links */}
      <div className="mt-3.5 flex items-center justify-between border-t border-border pt-3 text-xs">
        <div className="flex items-center gap-4">
          <div>
            <span className="text-fg-muted">TVL </span>
            <span className="font-mono-code font-medium text-fg">
              {formatUsd(project.tvl_usd)}
            </span>
          </div>
          <div>
            <span className="text-fg-muted">Funding </span>
            <span className="font-mono-code font-medium text-fg">
              {formatUsd(project.funding_usd)}
            </span>
          </div>
        </div>

        <div
          className="flex items-center gap-2 text-fg-muted"
          onClick={(e) => e.stopPropagation()}
        >
          <a
            href={project.url}
            target="_blank"
            rel="noreferrer"
            title="Site Oficial"
            className="transition hover:text-fg"
          >
            <Globe className="h-3.5 w-3.5" />
          </a>
          {project.twitter_url && (
            <a
              href={project.twitter_url}
              target="_blank"
              rel="noreferrer"
              title="X (Twitter)"
              className="font-semibold text-[11px] leading-none transition hover:text-fg"
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
              className="transition hover:text-fg"
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
              className="transition hover:text-fg"
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
              className="transition hover:text-fg"
            >
              <BookOpen className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
