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

export interface ProvenanceCheck {
  label: string;
  status: "PASS" | "WARN" | "FAIL" | string;
  detail: string;
}

export interface HackIncident {
  name?: string;
  date?: string | null;
  amount_usd?: number | null;
  classification?: string;
  technique?: string;
}

export interface AirdropPlatformStatus {
  platform: string;
  key: string;
  listed: boolean | null;
  status_label: string;
  url: string;
  search_url: string;
  home_url: string;
}

export interface ResearchHubItem {
  name: string;
  key: string;
  role: string;
  badge: string;
  active: boolean;
  url: string;
}

export interface WalletChainStat {
  chain: string;
  symbol: string;
  tx_count: number;
  balance: number;
  active: boolean;
  ok: boolean;
}

export interface WalletCheckResult {
  address: string;
  sybil_score: number;
  verdict: string;
  total_transactions: number;
  active_chains_count: number;
  total_eth_balance: number;
  chains: WalletChainStat[];
  checks: ProvenanceCheck[];
}

export interface TokenomicsSlice {
  label: string;
  key: string;
  percentage: number;
  color: string;
}

export interface TokenomicsData {
  source: string;
  source_label: string;
  slices: TokenomicsSlice[];
}

export interface AirdropEstimate {
  expected_fdv_usd: number;
  estimated_wallets: number;
  conservative_usd: number;
  base_usd: number;
  optimistic_usd: number;
  unlock_risk: "BAIXO" | "MÉDIO" | "ALTO" | string;
  insider_allocation_pct: number;
  tge_strategy: string;
}

export interface DeepMetrics {
  cost_model?: "FREE_TESTNET" | "CAPITAL_REQUIRED" | "HYBRID" | string;
  cost_model_label?: string;
  estimated_min_capital_usd?: string;
  profitability_rating?: "ALTA" | "MÉDIA" | "BAIXA" | string;
  saturation_risk?: "BAIXA" | "MÉDIA" | "ALTA" | string;
  asymmetry_summary?: string;
  fees_24h_usd?: number | null;
  fees_30d_usd?: number | null;
  fees_all_time_usd?: number | null;
  mcap_usd?: number | null;
  fdv_usd?: number | null;
  current_price_usd?: number | null;
  total_supply?: number | null;
  circulating_supply?: number | null;
  max_supply?: number | null;
  float_pct?: number | null;
  token_symbol?: string | null;
  is_tokenless?: boolean;
  domain_created_at?: string | null;
  domain_age_days?: number | null;
  audits_count?: number;
  audit_links?: string[];
  hacks_count?: number;
  hacks_history?: HackIncident[];
  tier1_investors?: string[];
  github_days_since_push?: number | null;
  github_languages?: string[];
  discord_members?: number | null;
  discord_online?: number | null;
  discord_online_pct?: number | null;
  telegram_members?: number | null;
  airdrop_platforms?: AirdropPlatformStatus[];
  ranked_platforms_count?: number;
  research_hub?: ResearchHubItem[];
  tokenomics?: TokenomicsData;
  airdrop_estimate?: AirdropEstimate;
  provenance_checks?: ProvenanceCheck[];
}

export interface DiscoverProjectItem {
  name: string;
  slug: string;
  url: string;
  category: string;
  chains: string[];
  tvl_usd: number;
  tvl_change_7d: number | null;
  twitter_url: string | null;
  listed_at?: number | null;
  alpha_score?: number;
  already_analyzed: boolean;
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
  cost_model?: string | null;
  profitability_rating?: string | null;
  fees_30d_usd?: number | null;
  hacks_count?: number;
  capital_invested_usd?: number;
  gas_spent_usd?: number;
  time_spent_hours?: number;
  points_accumulated?: string;
  reward_received_usd?: number;
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
  deep_metrics?: DeepMetrics;
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
  capital_invested_usd: number;
  gas_spent_usd: number;
  time_spent_hours: number;
  points_accumulated: string;
  reward_received_usd: number;
  investment_notes: string;
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
  total_capital_usd?: number;
  total_gas_usd?: number;
  total_hours?: number;
  total_rewards_usd?: number;
  net_roi_usd?: number;
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
