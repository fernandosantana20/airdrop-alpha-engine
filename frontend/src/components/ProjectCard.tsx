"use client";

import {
  Bell,
  BellOff,
  CheckCircle2,
  ExternalLink,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Eye,
} from "lucide-react";
import type { ProjectListItem } from "@/types/airdrop";
import { formatUsd } from "@/lib/api";
import { ScoreRing } from "./ScoreRing";

interface ProjectCardProps {
  project: ProjectListItem;
  onSelect: (id: number) => void;
}

export function ProjectCard({ project, onSelect }: ProjectCardProps) {
  const verdictStyles =
    project.verdict === "APPROVED"
      ? {
          badge: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
          label: "APROVADO",
          Icon: ShieldCheck,
        }
      : project.verdict === "WATCHLIST"
      ? {
          badge: "border-amber-500/30 bg-amber-500/10 text-amber-300",
          label: "WATCHLIST",
          Icon: Eye,
        }
      : {
          badge: "border-rose-500/30 bg-rose-500/10 text-rose-300",
          label: "REPROVADO",
          Icon: ShieldAlert,
        };

  const VerdictIcon = verdictStyles.Icon;
  const taskProgress =
    project.tasks_total > 0
      ? Math.round((project.tasks_completed / project.tasks_total) * 100)
      : 0;

  return (
    <div
      onClick={() => onSelect(project.id)}
      className="group cursor-pointer rounded-2xl border border-border bg-surface/85 p-5 transition duration-200 hover:border-emerald-500/40 hover:bg-elevated/70"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide ${verdictStyles.badge}`}
            >
              <VerdictIcon className="h-3 w-3" />
              {verdictStyles.label}
            </span>
            {project.category && (
              <span className="rounded-full border border-border bg-canvas/70 px-2.5 py-0.5 text-[11px] text-slate-300">
                {project.category}
              </span>
            )}
          </div>

          <h3 className="mt-2.5 truncate text-lg font-semibold text-slate-100 group-hover:text-emerald-300 transition">
            {project.name}
          </h3>
          <a
            href={project.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-cyan-300"
          >
            <span className="truncate max-w-[220px]">{project.url}</span>
            <ExternalLink className="h-3 w-3 shrink-0" />
          </a>
        </div>

        <ScoreRing score={project.fundamental_score} size={58} strokeWidth={5} />
      </div>

      {/* On-chain metrics strip */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-xl border border-border/70 bg-canvas/60 p-3">
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">
            TVL (DefiLlama)
          </p>
          <p className="mt-0.5 font-mono-code text-sm font-semibold text-slate-100">
            {formatUsd(project.tvl_usd)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">
            Funding Total
          </p>
          <p className="mt-0.5 font-mono-code text-sm font-semibold text-slate-100">
            {formatUsd(project.funding_usd)}
          </p>
        </div>
      </div>

      {/* Chains */}
      {project.chains.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Layers className="h-3.5 w-3.5 text-slate-500" />
          {project.chains.slice(0, 4).map((chain) => (
            <span
              key={chain}
              className="rounded-md bg-slate-800/80 px-2 py-0.5 text-[11px] text-slate-300"
            >
              {chain}
            </span>
          ))}
          {project.chains.length > 4 && (
            <span className="text-[11px] text-slate-500">
              +{project.chains.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Footer: Tasks & Monitoring */}
      <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-3 text-xs text-slate-400">
        {project.tasks_total > 0 ? (
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            <span>
              {project.tasks_completed}/{project.tasks_total} tasks ({taskProgress}%)
            </span>
          </div>
        ) : (
          <span className="text-slate-500">Sem plano Anti-Sybil (Score &lt; 70)</span>
        )}

        <div className="flex items-center gap-1.5">
          {project.monitoring_enabled ? (
            <span className="inline-flex items-center gap-1 text-cyan-300">
              <Bell className="h-3.5 w-3.5" />
              {project.alerts_count > 0 ? `${project.alerts_count} alert(s)` : "Monitorando"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-slate-500">
              <BellOff className="h-3.5 w-3.5" />
              Pausado
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
