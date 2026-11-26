from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator


# ---------------------------------------------------------------------------
# AI Structured Output Schemas (used directly by google-genai response_schema)
# ---------------------------------------------------------------------------


class ScoreBreakdown(BaseModel):
    product_utility: int = Field(
        ...,
        ge=0,
        le=20,
        description="Real product utility, differentiation, and PMF (0-20)",
    )
    backing_funding: int = Field(
        ...,
        ge=0,
        le=20,
        description="VC backing, Tier-1 investors, grants, and runway (0-20)",
    )
    tvl_traction: int = Field(
        ...,
        ge=0,
        le=20,
        description="TVL, active users, ecosystem adoption, or testnet traction (0-20)",
    )
    github_activity: int = Field(
        ...,
        ge=0,
        le=15,
        description="Open-source code quality, commit recency, and engineering velocity (0-15)",
    )
    airdrop_potential: int = Field(
        ...,
        ge=0,
        le=15,
        description="Tokenless status, points/XP mechanics, or explicit community allocation signals (0-15)",
    )
    security_rug_resistance: int = Field(
        ...,
        ge=0,
        le=10,
        description="Audits, transparency, doxxed team/org, and absence of rug-pull red flags (0-10)",
    )


class StrategicTaskSchema(BaseModel):
    title: str = Field(..., description="Short, actionable task title")
    description: str = Field(
        ..., description="Clear step-by-step instructions to execute the interaction"
    )
    category: Literal[
        "On-Chain", "Testnet", "Liquidity", "Governance", "Bridge", "Social", "Anti-Sybil"
    ] = Field(default="On-Chain")
    priority: Literal["HIGH", "MEDIUM", "LOW"] = Field(default="MEDIUM")
    frequency: Literal["ONCE", "WEEKLY", "BIWEEKLY", "MONTHLY"] = Field(
        default="WEEKLY"
    )
    estimated_cost_usd: str = Field(
        default="$1 - $5", description="Estimated gas/fee cost, e.g. 'Free (Testnet)' or '$2 - $5'"
    )
    anti_sybil_tip: str = Field(
        ...,
        description="Specific Anti-Sybil hygiene guidance (organic timing, varied amounts, avoiding bot patterns)",
    )
    action_url: Optional[str] = Field(
        default=None, description="Relevant dApp, docs, or bridge URL if known"
    )


class RoadmapMilestone(BaseModel):
    phase: str = Field(..., description="Phase or timeframe, e.g. 'Fase 1', 'Q1 2026', 'Testnet'")
    title: str = Field(..., description="Short milestone title")
    status: Literal["DONE", "IN_PROGRESS", "UPCOMING"] = Field(default="UPCOMING")
    details: str = Field(default="", description="Brief explanation of the milestone")


class DueDiligenceReport(BaseModel):
    project_name: str = Field(..., description="Official project name")
    category: str = Field(
        ..., description="Primary Web3 sector (e.g., Layer 2, Restaking, Perp DEX, Modular DA)"
    )
    fundamental_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Total fundamental score from 0 to 100 (sum of breakdown)",
    )
    verdict: Literal["APPROVED", "WATCHLIST", "REJECTED"] = Field(
        ...,
        description="APPROVED if score >= 70, WATCHLIST if 50-69, REJECTED if < 50",
    )
    score_breakdown: ScoreBreakdown
    executive_summary: str = Field(
        ...,
        description="Concise 2-4 sentence institutional due diligence verdict in Portuguese (PT-BR)",
    )
    bull_case: List[str] = Field(
        default_factory=list,
        description="3-5 concrete strengths and alpha catalysts in Portuguese (PT-BR)",
    )
    red_flags: List[str] = Field(
        default_factory=list,
        description="Concrete risks, missing fundamentals, or rug-pull indicators in Portuguese (PT-BR)",
    )
    roadmap_summary: str = Field(
        ...,
        description="Summary of current development stage, mainnet/TGE timeline, and roadmap signals",
    )
    roadmap_milestones: List[RoadmapMilestone] = Field(
        default_factory=list,
        description="3-6 structured roadmap milestones (past, current, upcoming) extracted from site/docs",
    )
    anti_sybil_strategy: str = Field(
        ...,
        description="High-level Anti-Sybil positioning strategy (wallet age, organic behavior, volume tiering)",
    )
    strategic_tasks: List[StrategicTaskSchema] = Field(
        default_factory=list,
        description="5-8 prioritized Anti-Sybil tasks ONLY when fundamental_score >= 70; empty list if < 70",
    )


# ---------------------------------------------------------------------------
# API Request Schemas
# ---------------------------------------------------------------------------


class AnalyzeProjectRequest(BaseModel):
    url: HttpUrl = Field(..., description="Official website or docs URL of the crypto project")
    docs_url: Optional[HttpUrl] = Field(
        default=None, description="Optional explicit documentation/GitBook URL"
    )
    force_refresh: bool = Field(
        default=False,
        description="Re-run full analysis even if the URL already exists in the database",
    )


class TaskToggleRequest(BaseModel):
    completed: bool


class MonitorToggleRequest(BaseModel):
    monitoring_enabled: bool
    monitored_url: Optional[HttpUrl] = None


class UpdateReferralRequest(BaseModel):
    user_referral_link: Optional[str] = None
    waitlist_url: Optional[str] = None


class UpdateTrackerRequest(BaseModel):
    capital_invested_usd: float = Field(default=0.0, ge=0.0)
    gas_spent_usd: float = Field(default=0.0, ge=0.0)
    time_spent_hours: float = Field(default=0.0, ge=0.0)
    points_accumulated: str = Field(default="", max_length=120)
    reward_received_usd: float = Field(default=0.0, ge=0.0)
    investment_notes: str = Field(default="", max_length=2000)


class WalletCheckRequest(BaseModel):
    address: str = Field(..., min_length=32, max_length=64)


class DiscoverProjectItem(BaseModel):
    name: str
    slug: str
    url: str
    category: str
    chains: List[str] = Field(default_factory=list)
    tvl_usd: float
    tvl_change_7d: Optional[float] = None
    twitter_url: Optional[str] = None
    listed_at: Optional[int] = None
    alpha_score: int = 50
    already_analyzed: bool = False


# ---------------------------------------------------------------------------
# API Response Schemas
# ---------------------------------------------------------------------------


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    title: str
    description: str
    category: str
    priority: str
    frequency: str
    estimated_cost_usd: str
    anti_sybil_tip: str
    action_url: Optional[str] = None
    completed: bool
    completed_at: Optional[datetime] = None
    created_at: datetime


class RoadmapSnapshotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    url: str
    content_hash: str
    diff_summary: str
    raw_diff: str
    alert_sent: bool
    detected_at: datetime


class EcosystemLink(BaseModel):
    label: str
    type: str
    url: str


class ProjectListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    url: str
    docs_url: Optional[str] = None
    twitter_url: Optional[str] = None
    telegram_url: Optional[str] = None
    instagram_url: Optional[str] = None
    category: Optional[str] = None
    chains: List[str] = Field(default_factory=list)
    tvl_usd: Optional[float] = None
    funding_usd: Optional[float] = None
    fundamental_score: int
    verdict: str
    analysis_mode: str
    monitoring_enabled: bool
    last_checked_at: Optional[datetime] = None
    created_at: datetime
    tasks_total: int = 0
    tasks_completed: int = 0
    alerts_count: int = 0
    has_waitlist: bool = False
    has_referral: bool = False
    waitlist_url: Optional[str] = None
    user_referral_link: Optional[str] = None
    cost_model: Optional[str] = None
    profitability_rating: Optional[str] = None
    fees_30d_usd: Optional[float] = None
    hacks_count: int = 0
    capital_invested_usd: float = 0.0
    gas_spent_usd: float = 0.0
    time_spent_hours: float = 0.0
    points_accumulated: str = ""
    reward_received_usd: float = 0.0


class ProjectDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    url: str
    docs_url: Optional[str] = None
    github_url: Optional[str] = None
    twitter_url: Optional[str] = None
    discord_url: Optional[str] = None
    telegram_url: Optional[str] = None
    instagram_url: Optional[str] = None
    ecosystem_links: List[EcosystemLink] = Field(default_factory=list)
    category: Optional[str] = None
    chains: List[str] = Field(default_factory=list)
    chain_tvls: Dict[str, float] = Field(default_factory=dict)

    @field_validator("ecosystem_links", "chains", "investors", "bull_case", "red_flags", "roadmap_milestones", mode="before")
    @classmethod
    def _coerce_none_list(cls, v):
        return [] if v is None else v

    @field_validator("waitlist_notes", "points_accumulated", "investment_notes", mode="before")
    @classmethod
    def _coerce_none_str(cls, v):
        return "" if v is None else str(v)

    @field_validator("capital_invested_usd", "gas_spent_usd", "time_spent_hours", "reward_received_usd", mode="before")
    @classmethod
    def _coerce_none_float(cls, v):
        return 0.0 if v is None else float(v)

    @field_validator("has_waitlist", "has_referral", mode="before")
    @classmethod
    def _coerce_none_bool(cls, v):
        return False if v is None else bool(v)

    @field_validator("chain_tvls", "score_breakdown", "deep_metrics", mode="before")
    @classmethod
    def _coerce_none_dict(cls, v):
        return {} if v is None else v
    tvl_usd: Optional[float] = None
    tvl_change_7d: Optional[float] = None
    funding_usd: Optional[float] = None
    investors: List[str] = Field(default_factory=list)
    github_stars: Optional[int] = None
    github_repos_count: Optional[int] = None
    github_last_push: Optional[str] = None
    fundamental_score: int
    verdict: str
    analysis_mode: str
    score_breakdown: Dict[str, int] = Field(default_factory=dict)
    deep_metrics: Dict[str, Any] = Field(default_factory=dict)
    executive_summary: str
    bull_case: List[str] = Field(default_factory=list)
    red_flags: List[str] = Field(default_factory=list)
    roadmap_summary: str
    roadmap_url: Optional[str] = None
    roadmap_milestones: List[RoadmapMilestone] = Field(default_factory=list)
    has_waitlist: bool = False
    waitlist_url: Optional[str] = None
    has_referral: bool = False
    referral_url: Optional[str] = None
    user_referral_link: Optional[str] = None
    waitlist_notes: str = ""
    anti_sybil_strategy: str
    capital_invested_usd: float = 0.0
    gas_spent_usd: float = 0.0
    time_spent_hours: float = 0.0
    points_accumulated: str = ""
    reward_received_usd: float = 0.0
    investment_notes: str = ""
    monitored_url: Optional[str] = None
    monitoring_enabled: bool
    last_content_hash: Optional[str] = None
    last_checked_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    tasks: List[TaskResponse] = Field(default_factory=list)
    roadmap_snapshots: List[RoadmapSnapshotResponse] = Field(default_factory=list)


class DashboardStatsResponse(BaseModel):
    total_projects: int
    approved_projects: int
    watchlist_projects: int
    rejected_projects: int
    total_tasks: int
    completed_tasks: int
    monitored_projects: int
    roadmap_alerts: int
    total_capital_usd: float = 0.0
    total_gas_usd: float = 0.0
    total_hours: float = 0.0
    total_rewards_usd: float = 0.0
    net_roi_usd: float = 0.0


class MonitorCheckResponse(BaseModel):
    project_id: int
    project_name: str
    url: str
    changed: bool
    diff_summary: Optional[str] = None
    alert_sent: bool = False
    checked_at: datetime


class HealthResponse(BaseModel):
    status: str
    gemini_configured: bool
    gemini_model: str
    telegram_configured: bool
    monitor_interval_minutes: int
    scheduler_running: bool
