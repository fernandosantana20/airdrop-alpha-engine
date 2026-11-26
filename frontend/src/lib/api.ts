import type {
  AirdropTask,
  DashboardStats,
  DiscoverProjectItem,
  HealthStatus,
  MonitorCheckResult,
  ProjectDetail,
  ProjectListItem,
  WalletCheckResult,
} from "@/types/airdrop";

function getApiBase(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, "");
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return "http://localhost:8000";
    }
    return "";
  }
  return "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getApiBase()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || JSON.stringify(body);
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthStatus>("/api/health"),

  stats: () => request<DashboardStats>("/api/stats"),

  listProjects: (params?: { verdict?: string; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.verdict && params.verdict !== "ALL") {
      qs.set("verdict", params.verdict);
    }
    if (params?.search?.trim()) {
      qs.set("search", params.search.trim());
    }
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<ProjectListItem[]>(`/api/projects${suffix}`);
  },

  getProject: (id: number) => request<ProjectDetail>(`/api/projects/${id}`),

  analyzeProject: (payload: {
    url: string;
    docs_url?: string;
    force_refresh?: boolean;
  }) =>
    request<ProjectDetail>("/api/projects/analyze", {
      method: "POST",
      body: JSON.stringify({
        url: payload.url,
        docs_url: payload.docs_url || null,
        force_refresh: Boolean(payload.force_refresh),
      }),
    }),

  deleteProject: (id: number) =>
    request<{ deleted: boolean; id: number }>(`/api/projects/${id}`, {
      method: "DELETE",
    }),

  toggleTask: (taskId: number, completed: boolean) =>
    request<AirdropTask>(`/api/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify({ completed }),
    }),

  updateMonitoring: (
    projectId: number,
    monitoring_enabled: boolean,
    monitored_url?: string
  ) =>
    request<ProjectDetail>(`/api/projects/${projectId}/monitoring`, {
      method: "PATCH",
      body: JSON.stringify({
        monitoring_enabled,
        monitored_url: monitored_url || null,
      }),
    }),

  updateReferral: (
    projectId: number,
    payload: { user_referral_link?: string; waitlist_url?: string }
  ) =>
    request<ProjectDetail>(`/api/projects/${projectId}/referral`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  updateTracker: (
    projectId: number,
    payload: {
      capital_invested_usd: number;
      gas_spent_usd: number;
      time_spent_hours: number;
      points_accumulated: string;
      reward_received_usd: number;
      investment_notes: string;
    }
  ) =>
    request<ProjectDetail>(`/api/projects/${projectId}/tracker`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  discover: (params?: {
    chain?: string;
    search?: string;
    sort?: string;
    min_tvl?: number;
    max_tvl?: number;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.chain && params.chain !== "ALL") qs.set("chain", params.chain);
    if (params?.search?.trim()) qs.set("search", params.search.trim());
    if (params?.sort) qs.set("sort", params.sort);
    if (params?.min_tvl !== undefined) qs.set("min_tvl", String(params.min_tvl));
    if (params?.max_tvl !== undefined) qs.set("max_tvl", String(params.max_tvl));
    if (params?.limit !== undefined) qs.set("limit", String(params.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<DiscoverProjectItem[]>(`/api/discover${suffix}`);
  },

  checkProjectUpdates: (projectId: number) =>
    request<MonitorCheckResult>(`/api/projects/${projectId}/check-updates`, {
      method: "POST",
    }),

  runAllMonitors: () =>
    request<MonitorCheckResult[]>("/api/monitor/run-all", {
      method: "POST",
    }),

  testTelegram: () =>
    request<{ sent: boolean; reason: string }>("/api/notifications/test", {
      method: "POST",
    }),

  checkWallet: (address: string) =>
    request<WalletCheckResult>("/api/wallet/check", {
      method: "POST",
      body: JSON.stringify({ address }),
    }),
};

export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "N/A";
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

export function formatRelativeDate(iso: string | null | undefined): string {
  if (!iso) return "Nunca";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
