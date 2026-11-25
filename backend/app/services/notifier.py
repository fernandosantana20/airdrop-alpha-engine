from __future__ import annotations

import html
import logging
from typing import Dict, List, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)


def _fmt_usd(value: Optional[float]) -> str:
    if value is None:
        return "N/A"
    if value >= 1_000_000_000:
        return f"${value / 1_000_000_000:.2f}B"
    if value >= 1_000_000:
        return f"${value / 1_000_000:.2f}M"
    if value >= 1_000:
        return f"${value / 1_000:.1f}K"
    return f"${value:.0f}"


class TelegramNotifier:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def send_message(self, text_html: str) -> Dict[str, object]:
        if not self.settings.has_telegram_config:
            return {
                "sent": False,
                "reason": "Telegram not configured (set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env).",
            }

        endpoint = (
            f"https://api.telegram.org/bot{self.settings.telegram_bot_token}/sendMessage"
        )
        payload = {
            "chat_id": self.settings.telegram_chat_id,
            "text": text_html[:4000],
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }

        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.post(endpoint, json=payload)
                if resp.status_code == 200:
                    return {"sent": True, "reason": "OK"}
                logger.warning(
                    "Telegram API returned %s: %s", resp.status_code, resp.text
                )
                return {
                    "sent": False,
                    "reason": f"Telegram API HTTP {resp.status_code}: {resp.text[:200]}",
                }
        except Exception as exc:
            logger.exception("Failed to send Telegram alert")
            return {"sent": False, "reason": str(exc)}

    async def send_project_approved_alert(
        self,
        project_name: str,
        url: str,
        score: int,
        category: Optional[str],
        tvl_usd: Optional[float],
        funding_usd: Optional[float],
        executive_summary: str,
        top_tasks: List[str],
    ) -> Dict[str, object]:
        safe_name = html.escape(project_name)
        safe_url = html.escape(url)
        safe_cat = html.escape(category or "Web3")
        safe_summary = html.escape(executive_summary[:500])

        tasks_block = ""
        if top_tasks:
            lines = [f"• {html.escape(t)}" for t in top_tasks[:4]]
            tasks_block = "\n\n<b>🎯 Ações Prioritárias (Anti-Sybil):</b>\n" + "\n".join(lines)

        msg = (
            f"🚀 <b>ALPHA APROVADO — {safe_name}</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"📊 <b>Fundamental Score:</b> <code>{score}/100</code>\n"
            f"🏷 <b>Setor:</b> {safe_cat}\n"
            f"💰 <b>TVL:</b> {_fmt_usd(tvl_usd)} | <b>Funding:</b> {_fmt_usd(funding_usd)}\n"
            f"🔗 <a href=\"{safe_url}\">{safe_url}</a>\n\n"
            f"<b>📝 Resumo Due Diligence:</b>\n{safe_summary}"
            f"{tasks_block}"
        )
        return await self.send_message(msg)

    async def send_roadmap_update_alert(
        self,
        project_name: str,
        monitored_url: str,
        score: int,
        diff_summary: str,
    ) -> Dict[str, object]:
        safe_name = html.escape(project_name)
        safe_url = html.escape(monitored_url)
        safe_diff = html.escape(diff_summary[:1800])

        msg = (
            f"🔔 <b>UPDATE DETECTADO NO ROADMAP/DOCS</b>\n"
            f"━━━━━━━━━━━━━━━━━━\n"
            f"📌 <b>Projeto:</b> {safe_name} (Score: <code>{score}/100</code>)\n"
            f"🔗 <a href=\"{safe_url}\">{safe_url}</a>\n\n"
            f"<b>📄 Mudanças Detectadas:</b>\n<pre>{safe_diff}</pre>"
        )
        return await self.send_message(msg)

    async def send_test_alert(self) -> Dict[str, object]:
        msg = (
            "✅ <b>Airdrop Alpha &amp; Due Diligence Engine</b>\n"
            "Conexão com Telegram Bot verificada com sucesso! "
            "Você receberá alertas automáticos de projetos aprovados (Score ≥ 70) e mudanças em roadmaps/docs."
        )
        return await self.send_message(msg)
