from __future__ import annotations

import asyncio
import difflib
import logging
from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import Project, RoadmapSnapshot, SessionLocal
from app.schemas import MonitorCheckResponse
from app.services.notifier import TelegramNotifier
from app.services.scraper import Web3Scraper

logger = logging.getLogger(__name__)


def build_text_diff(old_text: str, new_text: str, max_lines: int = 40) -> tuple[str, str]:
    """Returns (human_summary, raw_unified_diff)."""
    old_lines = old_text.splitlines()
    new_lines = new_text.splitlines()

    diff_lines = list(
        difflib.unified_diff(
            old_lines,
            new_lines,
            fromfile="previous",
            tofile="current",
            n=1,
            lineterm="",
        )
    )

    added = [line[1:].strip() for line in diff_lines if line.startswith("+") and not line.startswith("+++")]
    removed = [line[1:].strip() for line in diff_lines if line.startswith("-") and not line.startswith("---")]

    summary_parts: List[str] = [
        f"+{len(added)} linha(s) adicionada(s) | -{len(removed)} linha(s) removida(s)."
    ]
    if added:
        preview = "\n".join(f"+ {l[:160]}" for l in added[:8])
        summary_parts.append(f"Principais adições:\n{preview}")
    if removed:
        preview_rem = "\n".join(f"- {l[:160]}" for l in removed[:4])
        summary_parts.append(f"Principais remoções:\n{preview_rem}")

    human_summary = "\n\n".join(summary_parts)
    raw_diff = "\n".join(diff_lines[:max_lines])
    return human_summary, raw_diff


class RoadmapMonitor:
    def __init__(self) -> None:
        self.scraper = Web3Scraper()
        self.notifier = TelegramNotifier()
        self.settings = get_settings()

    async def _summarize_diff_with_gemini(
        self, project_name: str, raw_diff: str
    ) -> Optional[str]:
        if not self.settings.has_gemini_key or not raw_diff.strip():
            return None

        def _call() -> str:
            from google import genai

            client = genai.Client(api_key=self.settings.gemini_api_key)
            prompt = (
                f"Você monitora o projeto cripto '{project_name}'. "
                "Resuma em Português (PT-BR), em no máximo 4 bullet points curtos, "
                "as mudanças mais relevantes para caçadores de airdrop (roadmap, testnet, pontos, snapshot, TGE, tokenomics) "
                "encontradas neste diff de documentação/site:\n\n"
                f"{raw_diff[:4000]}"
            )
            resp = client.models.generate_content(
                model=self.settings.gemini_model,
                contents=prompt,
            )
            return (resp.text or "").strip()

        try:
            return await asyncio.to_thread(_call)
        except Exception as exc:
            logger.warning("Gemini diff summary failed: %s", exc)
            return None

    async def check_project(self, db: Session, project: Project) -> MonitorCheckResponse:
        target_url = project.monitored_url or project.docs_url or project.url
        now = datetime.now(timezone.utc)

        new_text, new_hash, err = await self.scraper.fetch_monitored_page(target_url)
        project.last_checked_at = now

        if err or not new_hash or new_text is None:
            db.commit()
            return MonitorCheckResponse(
                project_id=project.id,
                project_name=project.name,
                url=target_url,
                changed=False,
                diff_summary=f"Falha ao consultar página monitorada: {err}",
                alert_sent=False,
                checked_at=now,
            )

        # First baseline capture if none existed
        if not project.last_content_hash:
            project.last_content_hash = new_hash
            project.last_content_snapshot = new_text
            db.commit()
            return MonitorCheckResponse(
                project_id=project.id,
                project_name=project.name,
                url=target_url,
                changed=False,
                diff_summary="Baseline inicial capturado com sucesso.",
                alert_sent=False,
                checked_at=now,
            )

        if new_hash == project.last_content_hash:
            db.commit()
            return MonitorCheckResponse(
                project_id=project.id,
                project_name=project.name,
                url=target_url,
                changed=False,
                diff_summary="Nenhuma alteração detectada.",
                alert_sent=False,
                checked_at=now,
            )

        # Change detected!
        old_text = project.last_content_snapshot or ""
        heuristic_summary, raw_diff = build_text_diff(old_text, new_text)
        ai_summary = await self._summarize_diff_with_gemini(project.name, raw_diff)
        final_summary = ai_summary or heuristic_summary

        alert_res = await self.notifier.send_roadmap_update_alert(
            project_name=project.name,
            monitored_url=target_url,
            score=project.fundamental_score,
            diff_summary=final_summary,
        )
        alert_sent = bool(alert_res.get("sent", False))

        snapshot = RoadmapSnapshot(
            project_id=project.id,
            url=target_url,
            content_hash=new_hash,
            diff_summary=final_summary,
            raw_diff=raw_diff,
            alert_sent=alert_sent,
            detected_at=now,
        )
        db.add(snapshot)

        project.last_content_hash = new_hash
        project.last_content_snapshot = new_text
        db.commit()

        return MonitorCheckResponse(
            project_id=project.id,
            project_name=project.name,
            url=target_url,
            changed=True,
            diff_summary=final_summary,
            alert_sent=alert_sent,
            checked_at=now,
        )

    async def run_scheduled_check(self) -> List[MonitorCheckResponse]:
        db = SessionLocal()
        results: List[MonitorCheckResponse] = []
        try:
            projects = (
                db.query(Project)
                .filter(Project.monitoring_enabled.is_(True))
                .all()
            )
            logger.info("Running roadmap monitor for %d enabled project(s).", len(projects))
            for proj in projects:
                try:
                    res = await self.check_project(db, proj)
                    results.append(res)
                except Exception as exc:
                    logger.exception("Error monitoring project %s: %s", proj.name, exc)
        finally:
            db.close()
        return results
