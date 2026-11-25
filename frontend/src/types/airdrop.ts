export type Verdict = "APPROVED" | "WATCHLIST" | "REJECTED";

export interface EcosystemLink {
  label: string;
  type: string;
  url: string;
}

export interface RoadmapMilestone {
  phase: string;
  title: string;
  status: "DONE" | "IN_PROGRESS" | "UPCOMING" | string;
  details: string;
}

export interface ScoreBreakdown {
  product_utility: number;
  backing_funding: number;
  tvl_traction: number;
  github_activity: number;
  airdrop_potential: number;
  security_rug_resistance: number;
}

export interface AirdropTask {
  id: number;
  project_id: number;
  title: string;
  description: string;
  category: string;
  priority: "HIGH" | "MEDIUM" | "LOW" | string;
  frequency: "ONCE" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | string;
  estimated_cost_usd: string;
  anti_sybil_tip: string;
  action_url: string | null;
  completed: boolean;
  completed_at: string | null;
  created_at: string;
}

export interface RoadmapSnapshot {
  id: number;
  project_id: number;
  url: string;
  content_hash: string;
  diff_summary: string;
  raw_diff: string;
  alert_sent: boolean;
  detected_at: string;
}

export interface ProjectListItem {
  id: number;
  name: string;
  slug: string;
  url: string;
  docs_url: string | null;
  twitter_url: string | null;
  telegram_url: string | null;
  instagram_url: string | null;
  category: string | null;
  chains: string[];
  tvl_usd: number | null;
  funding_usd: number | null;
  fundamental_score: number;
  verdict: Verdict;
  analysis_mode: "gemini" | "heuristic" | string;
  monitoring_enabled: boolean;
  last_checked_at: string | null;
  created_at: string;
  tasks_total: number;
  tasks_completed: number;
  alerts_count: number;
  has_waitlist: boolean;
  has_referral: boolean;
  waitlist_url: string | null;
  user_referral_link: string | null;
}

export interface ProjectDetail {
  id: number;
  name: string;
  slug: string;
  url: string;
  docs_url: string | null;
  github_url: string | null;
  twitter_url: string | null;
  discord_url: string | null;
  telegram_url: string | null;
  instagram_url: string | null;
  ecosystem_links: EcosystemLink[];
  category: string | null;
  chains: string[];
  chain_tvls: Record<string, number>;
  tvl_usd: number | null;
  tvl_change_7d: number | null;
  funding_usd: number | null;
  investors: string[];
  github_stars: number | null;
  github_repos_count: number | null;
  github_last_push: string | null;
  fundamental_score: number;
  verdict: Verdict;
  analysis_mode: "gemini" | "heuristic" | string;
  score_breakdown: ScoreBreakdown;
  executive_summary: string;
  bull_case: string[];
  red_flags: string[];
  roadmap_summary: string;
  roadmap_url: string | null;
  roadmap_milestones: RoadmapMilestone[];
  has_waitlist: boolean;
  waitlist_url: string | null;
  has_referral: boolean;
  referral_url: string | null;
  user_referral_link: string | null;
  waitlist_notes: string;
  anti_sybil_strategy: string;
  monitored_url: string | null;
  monitoring_enabled: boolean;
  last_content_hash: string | null;
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
  tasks: AirdropTask[];
  roadmap_snapshots: RoadmapSnapshot[];
}

export interface DashboardStats {
  total_projects: number;
  approved_projects: number;
  watchlist_projects: number;
  rejected_projects: number;
  total_tasks: number;
  completed_tasks: number;
  monitored_projects: number;
  roadmap_alerts: number;
}

export interface HealthStatus {
  status: string;
  gemini_configured: boolean;
  gemini_model: string;
  telegram_configured: boolean;
  monitor_interval_minutes: number;
  scheduler_running: boolean;
}

export interface MonitorCheckResult {
  project_id: number;
  project_name: string;
  url: string;
  changed: boolean;
  diff_summary: string | null;
  alert_sent: boolean;
  checked_at: string;
}
