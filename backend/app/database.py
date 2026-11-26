from __future__ import annotations

from datetime import datetime, timezone
from typing import Generator

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    create_engine,
    inspect,
    text,
)
from sqlalchemy.orm import DeclarativeBase, Session, relationship, sessionmaker

from app.config import get_settings

settings = get_settings()

db_url = settings.effective_database_url
connect_args = (
    {"check_same_thread": False}
    if db_url.startswith("sqlite")
    else {}
)

engine = create_engine(
    db_url,
    connect_args=connect_args,
    pool_pre_ping=True,
    future=True,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    future=True,
)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    slug = Column(String(200), nullable=False, index=True)
    url = Column(String(500), nullable=False, unique=True, index=True)

    # Discovered links
    docs_url = Column(String(500), nullable=True)
    github_url = Column(String(500), nullable=True)
    twitter_url = Column(String(500), nullable=True)
    discord_url = Column(String(500), nullable=True)
    telegram_url = Column(String(500), nullable=True)
    instagram_url = Column(String(500), nullable=True)
    ecosystem_links = Column(JSON, default=list, nullable=False)

    # On-chain & GitHub metrics
    category = Column(String(120), nullable=True)
    chains = Column(JSON, default=list, nullable=False)
    chain_tvls = Column(JSON, default=dict, nullable=False)
    tvl_usd = Column(Float, nullable=True)
    tvl_change_7d = Column(Float, nullable=True)
    funding_usd = Column(Float, nullable=True)
    investors = Column(JSON, default=list, nullable=False)
    github_stars = Column(Integer, nullable=True)
    github_repos_count = Column(Integer, nullable=True)
    github_last_push = Column(String(64), nullable=True)

    # Due Diligence Output
    fundamental_score = Column(Integer, nullable=False, default=0)
    verdict = Column(String(32), nullable=False, default="REJECTED", index=True)
    analysis_mode = Column(String(32), nullable=False, default="gemini")
    score_breakdown = Column(JSON, default=dict, nullable=False)
    deep_metrics = Column(JSON, default=dict, nullable=False)
    executive_summary = Column(Text, nullable=False, default="")
    bull_case = Column(JSON, default=list, nullable=False)
    red_flags = Column(JSON, default=list, nullable=False)
    roadmap_summary = Column(Text, nullable=False, default="")
    roadmap_url = Column(String(500), nullable=True)
    roadmap_milestones = Column(JSON, default=list, nullable=False)
    has_waitlist = Column(Boolean, default=False, nullable=False)
    waitlist_url = Column(String(500), nullable=True)
    has_referral = Column(Boolean, default=False, nullable=False)
    referral_url = Column(String(500), nullable=True)
    user_referral_link = Column(String(500), nullable=True)
    waitlist_notes = Column(Text, nullable=False, default="")
    anti_sybil_strategy = Column(Text, nullable=False, default="")

    # Personal investment, time, points & reward tracker
    capital_invested_usd = Column(Float, default=0.0, nullable=False)
    gas_spent_usd = Column(Float, default=0.0, nullable=False)
    time_spent_hours = Column(Float, default=0.0, nullable=False)
    points_accumulated = Column(String(120), default="", nullable=False)
    reward_received_usd = Column(Float, default=0.0, nullable=False)
    investment_notes = Column(Text, default="", nullable=False)

    # Monitoring state
    monitored_url = Column(String(500), nullable=True)
    monitoring_enabled = Column(Boolean, default=True, nullable=False)
    last_content_hash = Column(String(64), nullable=True)
    last_content_snapshot = Column(Text, nullable=True)
    last_checked_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    tasks = relationship(
        "AirdropTask",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="AirdropTask.id.asc()",
    )
    roadmap_snapshots = relationship(
        "RoadmapSnapshot",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="RoadmapSnapshot.detected_at.desc()",
    )


class AirdropTask(Base):
    __tablename__ = "airdrop_tasks"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String(64), nullable=False, default="On-Chain")
    priority = Column(String(16), nullable=False, default="MEDIUM")
    frequency = Column(String(32), nullable=False, default="WEEKLY")
    estimated_cost_usd = Column(String(64), nullable=False, default="< $5")
    anti_sybil_tip = Column(Text, nullable=False, default="")
    action_url = Column(String(500), nullable=True)
    completed = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    project = relationship("Project", back_populates="tasks")


class RoadmapSnapshot(Base):
    __tablename__ = "roadmap_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    project_id = Column(
        Integer, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    url = Column(String(500), nullable=False)
    content_hash = Column(String(64), nullable=False)
    diff_summary = Column(Text, nullable=False)
    raw_diff = Column(Text, nullable=False, default="")
    alert_sent = Column(Boolean, default=False, nullable=False)
    detected_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    project = relationship("Project", back_populates="roadmap_snapshots")


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    # Safe idempotent column migrations for existing SQLite / Postgres tables
    inspector = inspect(engine)
    if "projects" in inspector.get_table_names():
        existing_cols = {c["name"] for c in inspector.get_columns("projects")}
        json_type = "JSON" if not db_url.startswith("sqlite") else "TEXT"
        migrations = [
            ("instagram_url", "VARCHAR(500)"),
            ("ecosystem_links", json_type),
            ("chain_tvls", json_type),
            ("roadmap_url", "VARCHAR(500)"),
            ("roadmap_milestones", json_type),
            ("has_waitlist", "BOOLEAN DEFAULT FALSE"),
            ("waitlist_url", "VARCHAR(500)"),
            ("has_referral", "BOOLEAN DEFAULT FALSE"),
            ("referral_url", "VARCHAR(500)"),
            ("user_referral_link", "VARCHAR(500)"),
            ("waitlist_notes", "TEXT DEFAULT ''"),
            ("deep_metrics", json_type),
            ("capital_invested_usd", "DOUBLE PRECISION DEFAULT 0" if not db_url.startswith("sqlite") else "REAL DEFAULT 0"),
            ("gas_spent_usd", "DOUBLE PRECISION DEFAULT 0" if not db_url.startswith("sqlite") else "REAL DEFAULT 0"),
            ("time_spent_hours", "DOUBLE PRECISION DEFAULT 0" if not db_url.startswith("sqlite") else "REAL DEFAULT 0"),
            ("points_accumulated", "VARCHAR(120) DEFAULT ''"),
            ("reward_received_usd", "DOUBLE PRECISION DEFAULT 0" if not db_url.startswith("sqlite") else "REAL DEFAULT 0"),
            ("investment_notes", "TEXT DEFAULT ''"),
        ]
        with engine.begin() as conn:
            for col_name, col_type in migrations:
                if col_name not in existing_cols:
                    conn.execute(
                        text(f"ALTER TABLE projects ADD COLUMN {col_name} {col_type}")
                    )


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
