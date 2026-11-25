from __future__ import annotations

import logging
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List, Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import AirdropTask, Project, RoadmapSnapshot, get_db, init_db
from app.schemas import (
    AnalyzeProjectRequest,
    DashboardStatsResponse,
    HealthResponse,
    MonitorCheckResponse,
    MonitorToggleRequest,
    ProjectDetailResponse,
    ProjectListItem,
    TaskResponse,
    TaskToggleRequest,
    UpdateReferralRequest,
)
from app.services.ai_analyzer import AIDueDiligenceAnalyzer
from app.services.monitor import RoadmapMonitor
from app.services.notifier import TelegramNotifier
from app.services.onchain_data import DefiLlamaClient
from app.services.scraper import Web3Scraper, normalize_url

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()
scheduler = AsyncIOScheduler()
roadmap_monitor = RoadmapMonitor()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "project"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    if not settings.is_vercel:
        scheduler.add_job(
            roadmap_monitor.run_scheduled_check,
            trigger="interval",
            minutes=max(5, settings.monitor_interval_minutes),
            id="roadmap_monitor_job",
            replace_existing=True,
        )
        scheduler.start()
    logger.info(
        "Airdrop Alpha Engine started (Vercel: %s, Monitor interval: %d min, Gemini: %s, Telegram: %s)",
        settings.is_vercel,
        settings.monitor_interval_minutes,
        settings.has_gemini_key,
        settings.has_telegram_config,
    )
    yield
    if scheduler.running:
        scheduler.shutdown(wait=False)


app = FastAPI(
    title="Airdrop Alpha & Due Diligence Engine",
    description="Web3 fundamental due diligence, Anti-Sybil strategic task planner, and roadmap monitor.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    return HealthResponse(
        status="ok",
        gemini_configured=settings.has_gemini_key,
        gemini_model=settings.gemini_model,
        telegram_configured=settings.has_telegram_config,
        monitor_interval_minutes=settings.monitor_interval_minutes,
        scheduler_running=scheduler.running,
    )


@app.get("/api/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats(db: Session = Depends(get_db)) -> DashboardStatsResponse:
    projects = db.query(Project).all()
    tasks = db.query(AirdropTask).all()
    alerts_count = db.query(RoadmapSnapshot).count()

    return DashboardStatsResponse(
        total_projects=len(projects),
        approved_projects=sum(1 for p in projects if p.verdict == "APPROVED"),
        watchlist_projects=sum(1 for p in projects if p.verdict == "WATCHLIST"),
        rejected_projects=sum(1 for p in projects if p.verdict == "REJECTED"),
        total_tasks=len(tasks),
        completed_tasks=sum(1 for t in tasks if t.completed),
        monitored_projects=sum(1 for p in projects if p.monitoring_enabled),
        roadmap_alerts=alerts_count,
    )


@app.get("/api/projects", response_model=List[ProjectListItem])
def list_projects(
    verdict: Optional[str] = Query(default=None, description="Filter by APPROVED, WATCHLIST, or REJECTED"),
    search: Optional[str] = Query(default=None, description="Search by name, category, or URL"),
    db: Session = Depends(get_db),
) -> List[ProjectListItem]:
    query = db.query(Project).order_by(Project.fundamental_score.desc(), Project.created_at.desc())
    if verdict and verdict.upper() in {"APPROVED", "WATCHLIST", "REJECTED"}:
        query = query.filter(Project.verdict == verdict.upper())

    projects = query.all()
    if search:
        needle = search.strip().lower()
        projects = [
            p
            for p in projects
            if needle in (p.name or "").lower()
            or needle in (p.category or "").lower()
            or needle in (p.url or "").lower()
            or any(needle in str(c).lower() for c in (p.chains or []))
        ]

    items: List[ProjectListItem] = []
    for p in projects:
        items.append(
            ProjectListItem(
                id=p.id,
                name=p.name,
                slug=p.slug,
                url=p.url,
                docs_url=p.docs_url,
                twitter_url=p.twitter_url,
                telegram_url=p.telegram_url,
                instagram_url=p.instagram_url,
                category=p.category,
                chains=p.chains or [],
                tvl_usd=p.tvl_usd,
                funding_usd=p.funding_usd,
                fundamental_score=p.fundamental_score,
                verdict=p.verdict,
                analysis_mode=p.analysis_mode,
                monitoring_enabled=p.monitoring_enabled,
                last_checked_at=p.last_checked_at,
                created_at=p.created_at,
                tasks_total=len(p.tasks),
                tasks_completed=sum(1 for t in p.tasks if t.completed),
                alerts_count=len(p.roadmap_snapshots),
                has_waitlist=bool(p.has_waitlist),
                has_referral=bool(p.has_referral or p.user_referral_link),
                waitlist_url=p.waitlist_url,
                user_referral_link=p.user_referral_link,
            )
        )
    return items


@app.get("/api/projects/{project_id}", response_model=ProjectDetailResponse)
def get_project_detail(
    project_id: int, db: Session = Depends(get_db)
) -> ProjectDetailResponse:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return ProjectDetailResponse.model_validate(project)


@app.post("/api/projects/analyze", response_model=ProjectDetailResponse)
async def analyze_project(
    payload: AnalyzeProjectRequest, db: Session = Depends(get_db)
) -> ProjectDetailResponse:
    normalized = normalize_url(str(payload.url))
    existing = db.query(Project).filter(Project.url == normalized).first()

    if existing and not payload.force_refresh:
        return ProjectDetailResponse.model_validate(existing)

    scraper = Web3Scraper()
    defillama = DefiLlamaClient()
    analyzer = AIDueDiligenceAnalyzer()
    notifier = TelegramNotifier()

    # 1. Scrape website, docs, roadmap, and GitHub
    scraped = await scraper.scrape_project(
        url=normalized,
        explicit_docs_url=str(payload.docs_url) if payload.docs_url else None,
    )

    # 2. Enrich with DefiLlama on-chain & VC funding data
    onchain = await defillama.fetch_metrics(
        project_name=scraped.inferred_name,
        domain=scraped.domain,
    )

    # 3. Run AI Due Diligence (Gemini Structured Outputs or heuristic fallback)
    report, analysis_mode = await analyzer.analyze(scraped, onchain)

    now = datetime.now(timezone.utc)
    if existing:
        project = existing
        # Replace old tasks on refresh
        db.query(AirdropTask).filter(AirdropTask.project_id == project.id).delete()
    else:
        project = Project(url=normalized)
        db.add(project)

    project.name = report.project_name
    project.slug = onchain.slug or _slugify(report.project_name)
    project.docs_url = scraped.docs_url
    project.github_url = scraped.github_url or onchain.defillama_github
    project.twitter_url = scraped.twitter_url or onchain.defillama_twitter
    project.discord_url = scraped.discord_url
    project.telegram_url = scraped.telegram_url
    project.instagram_url = scraped.instagram_url

    # Build complete deduplicated attachment of all linked project channels
    eco_links: List[dict] = []
    seen_eco: set[str] = set()

    def _add_eco(label: str, kind: str, link_url: Optional[str]) -> None:
        if not link_url:
            return
        clean = link_url.strip().rstrip("/")
        if clean and clean.lower() not in seen_eco:
            seen_eco.add(clean.lower())
            eco_links.append({"label": label, "type": kind, "url": link_url.strip()})

    _add_eco("Site Oficial", "website", onchain.official_url or normalized)
    if onchain.official_url and normalize_url(onchain.official_url) != normalized:
        _add_eco("App / dApp", "app", normalized)
    _add_eco("X (Twitter)", "twitter", project.twitter_url)
    _add_eco("Telegram", "telegram", project.telegram_url)
    _add_eco("Instagram", "instagram", project.instagram_url)
    _add_eco("Discord", "discord", project.discord_url)
    _add_eco("GitHub", "github", project.github_url)
    _add_eco("Documentação / Docs", "docs", project.docs_url)
    _add_eco("Roadmap", "roadmap", scraped.roadmap_url)
    _add_eco("Waitlist / Early Access", "waitlist", scraped.waitlist_url)
    _add_eco("Programa de Referral / Pontos", "referral", scraped.referral_url)
    if onchain.slug:
        _add_eco("DefiLlama", "analytics", f"https://defillama.com/protocol/{onchain.slug}")
    for idx, audit_u in enumerate(onchain.audit_links[:4], start=1):
        _add_eco(f"Auditoria #{idx}", "audit", audit_u)
    for extra in scraped.extra_links:
        _add_eco(extra["label"], extra["type"], extra["url"])

    project.ecosystem_links = eco_links

    # Merge DefiLlama chains + detected chains from website/docs text
    merged_chains = list(onchain.chains)
    for ch in scraped.detected_chains:
        if ch not in merged_chains:
            merged_chains.append(ch)

    project.category = report.category or onchain.category
    project.chains = merged_chains
    project.chain_tvls = onchain.chain_tvls
    project.tvl_usd = onchain.tvl_usd
    project.tvl_change_7d = onchain.tvl_change_7d
    project.funding_usd = onchain.total_funding_usd
    project.investors = onchain.investors

    if scraped.github_metrics:
        project.github_stars = scraped.github_metrics.stars
        project.github_repos_count = scraped.github_metrics.repos_count
        project.github_last_push = scraped.github_metrics.last_push

    project.fundamental_score = report.fundamental_score
    project.verdict = report.verdict
    project.analysis_mode = analysis_mode
    project.score_breakdown = report.score_breakdown.model_dump()
    project.executive_summary = report.executive_summary
    project.bull_case = report.bull_case
    project.red_flags = report.red_flags
    project.roadmap_summary = report.roadmap_summary
    project.roadmap_url = scraped.roadmap_url
    project.roadmap_milestones = [m.model_dump() for m in report.roadmap_milestones]
    project.has_waitlist = scraped.has_waitlist
    project.waitlist_url = scraped.waitlist_url or project.waitlist_url
    project.has_referral = scraped.has_referral or bool(project.user_referral_link)
    project.referral_url = scraped.referral_url
    project.waitlist_notes = scraped.waitlist_notes
    project.anti_sybil_strategy = report.anti_sybil_strategy

    project.monitored_url = scraped.monitored_url
    project.monitoring_enabled = report.fundamental_score >= 50
    project.last_content_hash = scraped.content_hash
    project.last_content_snapshot = scraped.monitored_text_snapshot
    project.last_checked_at = now

    db.flush()

    for task_data in report.strategic_tasks:
        db.add(
            AirdropTask(
                project_id=project.id,
                title=task_data.title,
                description=task_data.description,
                category=task_data.category,
                priority=task_data.priority,
                frequency=task_data.frequency,
                estimated_cost_usd=task_data.estimated_cost_usd,
                anti_sybil_tip=task_data.anti_sybil_tip,
                action_url=task_data.action_url,
            )
        )

    db.commit()
    db.refresh(project)

    # Notify Telegram automatically if project is approved (Score >= 70)
    if project.fundamental_score >= 70:
        await notifier.send_project_approved_alert(
            project_name=project.name,
            url=project.url,
            score=project.fundamental_score,
            category=project.category,
            tvl_usd=project.tvl_usd,
            funding_usd=project.funding_usd,
            executive_summary=project.executive_summary,
            top_tasks=[t.title for t in project.tasks],
            chains=project.chains,
            links=project.ecosystem_links,
        )

    return ProjectDetailResponse.model_validate(project)


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)) -> dict:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    db.delete(project)
    db.commit()
    return {"deleted": True, "id": project_id}


@app.patch("/api/projects/{project_id}/monitoring", response_model=ProjectDetailResponse)
def update_monitoring(
    project_id: int,
    payload: MonitorToggleRequest,
    db: Session = Depends(get_db),
) -> ProjectDetailResponse:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    project.monitoring_enabled = payload.monitoring_enabled
    if payload.monitored_url:
        project.monitored_url = normalize_url(str(payload.monitored_url))
    db.commit()
    db.refresh(project)
    return ProjectDetailResponse.model_validate(project)


@app.patch("/api/projects/{project_id}/referral", response_model=ProjectDetailResponse)
def update_project_referral(
    project_id: int,
    payload: UpdateReferralRequest,
    db: Session = Depends(get_db),
) -> ProjectDetailResponse:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    if payload.user_referral_link is not None:
        cleaned_ref = payload.user_referral_link.strip()
        project.user_referral_link = cleaned_ref or None
        if cleaned_ref:
            project.has_referral = True
    if payload.waitlist_url is not None:
        cleaned_wl = payload.waitlist_url.strip()
        project.waitlist_url = cleaned_wl or None
        if cleaned_wl:
            project.has_waitlist = True
    db.commit()
    db.refresh(project)
    return ProjectDetailResponse.model_validate(project)


@app.post("/api/projects/{project_id}/check-updates", response_model=MonitorCheckResponse)
async def check_project_updates(
    project_id: int, db: Session = Depends(get_db)
) -> MonitorCheckResponse:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projeto não encontrado.")
    return await roadmap_monitor.check_project(db, project)


@app.post("/api/monitor/run-all", response_model=List[MonitorCheckResponse])
async def run_all_monitors() -> List[MonitorCheckResponse]:
    return await roadmap_monitor.run_scheduled_check()


@app.patch("/api/tasks/{task_id}", response_model=TaskResponse)
def toggle_task(
    task_id: int, payload: TaskToggleRequest, db: Session = Depends(get_db)
) -> TaskResponse:
    task = db.query(AirdropTask).filter(AirdropTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Tarefa não encontrada.")
    task.completed = payload.completed
    task.completed_at = datetime.now(timezone.utc) if payload.completed else None
    db.commit()
    db.refresh(task)
    return TaskResponse.model_validate(task)


@app.post("/api/notifications/test")
async def test_telegram_notification() -> dict:
    notifier = TelegramNotifier()
    return await notifier.send_test_alert()
