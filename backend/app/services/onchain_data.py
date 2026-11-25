from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

DEFILLAMA_PROTOCOLS_URL = "https://api.llama.fi/protocols"
DEFILLAMA_RAISES_URL = "https://api.llama.fi/raises"

# Simple in-memory TTL cache to avoid re-fetching DefiLlama catalogs on every request
_CACHE: Dict[str, Any] = {
    "protocols": {"data": None, "fetched_at": 0.0, "ttl": 900.0},
    "raises": {"data": None, "fetched_at": 0.0, "ttl": 1800.0},
}


@dataclass
class FundingRound:
    round_name: str
    amount_usd_millions: Optional[float]
    date: Optional[str]
    lead_investors: List[str] = field(default_factory=list)
    other_investors: List[str] = field(default_factory=list)


@dataclass
class OnChainMetrics:
    matched_protocol: Optional[str] = None
    slug: Optional[str] = None
    category: Optional[str] = None
    chains: List[str] = field(default_factory=list)
    tvl_usd: Optional[float] = None
    tvl_change_1d: Optional[float] = None
    tvl_change_7d: Optional[float] = None
    mcap_usd: Optional[float] = None
    token_symbol: Optional[str] = None
    total_funding_usd: Optional[float] = None
    investors: List[str] = field(default_factory=list)
    funding_rounds: List[FundingRound] = field(default_factory=list)
    defillama_twitter: Optional[str] = None
    defillama_github: Optional[str] = None
    source_notes: List[str] = field(default_factory=list)


def _normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _extract_root_domain(url: Optional[str]) -> str:
    if not url:
        return ""
    try:
        netloc = urlparse(url if "://" in url else f"https://{url}").netloc.lower()
        for prefix in ("www.", "app.", "docs."):
            if netloc.startswith(prefix):
                netloc = netloc[len(prefix) :]
        return netloc
    except Exception:
        return ""


class DefiLlamaClient:
    def __init__(self, timeout: float = 20.0) -> None:
        self.timeout = timeout

    async def _get_cached_json(self, cache_key: str, url: str) -> Any:
        entry = _CACHE[cache_key]
        now = time.time()
        if entry["data"] is not None and (now - entry["fetched_at"]) < entry["ttl"]:
            return entry["data"]

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url)
                resp.raise_for_status()
                data = resp.json()
                entry["data"] = data
                entry["fetched_at"] = now
                return data
        except Exception as exc:
            logger.warning("DefiLlama request failed for %s: %s", url, exc)
            return entry["data"]  # Return stale cache if available

    async def fetch_metrics(
        self, project_name: str, domain: str
    ) -> OnChainMetrics:
        metrics = OnChainMetrics()
        target_domain = _extract_root_domain(domain)
        target_key = _normalize_key(project_name)
        domain_key = _normalize_key(target_domain.split(".")[0]) if target_domain else ""

        # 1. DefiLlama Protocols (TVL, Chains, Category, Token status)
        protocols = await self._get_cached_json("protocols", DEFILLAMA_PROTOCOLS_URL)
        matched_proto: Optional[Dict[str, Any]] = None

        if isinstance(protocols, list):
            for proto in protocols:
                proto_domain = _extract_root_domain(proto.get("url"))
                if target_domain and proto_domain and proto_domain == target_domain:
                    matched_proto = proto
                    break

            if not matched_proto:
                for proto in protocols:
                    proto_name_key = _normalize_key(str(proto.get("name", "")))
                    proto_slug_key = _normalize_key(str(proto.get("slug", "")))
                    if proto_name_key in {target_key, domain_key} or proto_slug_key in {
                        target_key,
                        domain_key,
                    }:
                        matched_proto = proto
                        break

        if matched_proto:
            metrics.matched_protocol = matched_proto.get("name")
            metrics.slug = matched_proto.get("slug")
            metrics.category = matched_proto.get("category")
            metrics.chains = list(matched_proto.get("chains") or [])
            tvl = matched_proto.get("tvl")
            metrics.tvl_usd = float(tvl) if tvl is not None else None
            c1d = matched_proto.get("change_1d")
            c7d = matched_proto.get("change_7d")
            metrics.tvl_change_1d = float(c1d) if c1d is not None else None
            metrics.tvl_change_7d = float(c7d) if c7d is not None else None
            mcap = matched_proto.get("mcap")
            metrics.mcap_usd = float(mcap) if mcap is not None else None
            symbol = matched_proto.get("symbol")
            if symbol and symbol != "-":
                metrics.token_symbol = str(symbol)
            if matched_proto.get("twitter"):
                metrics.defillama_twitter = f"https://x.com/{matched_proto['twitter']}"
            github_list = matched_proto.get("github")
            if isinstance(github_list, list) and github_list:
                metrics.defillama_github = f"https://github.com/{github_list[0]}"
            metrics.source_notes.append(
                f"Matched DefiLlama protocol '{metrics.matched_protocol}' (slug: {metrics.slug})."
            )
        else:
            metrics.source_notes.append(
                "Not yet indexed on DefiLlama TVL catalog (common for pre-mainnet/testnet or infra projects)."
            )

        # 2. DefiLlama Raises (VC Funding & Investors)
        raises_payload = await self._get_cached_json("raises", DEFILLAMA_RAISES_URL)
        raises_list = (
            raises_payload.get("raises", [])
            if isinstance(raises_payload, dict)
            else []
        )

        matched_raises: List[Dict[str, Any]] = []
        search_keys = {k for k in (target_key, domain_key) if len(k) >= 3}
        if metrics.matched_protocol:
            search_keys.add(_normalize_key(metrics.matched_protocol))

        for r in raises_list:
            r_name_key = _normalize_key(str(r.get("name", "")))
            if r_name_key in search_keys:
                matched_raises.append(r)

        if matched_raises:
            total_millions = 0.0
            all_investors: List[str] = []
            for r in matched_raises:
                amt = r.get("amount")
                amt_float = float(amt) if amt is not None else None
                if amt_float:
                    total_millions += amt_float
                leads = [str(i) for i in (r.get("leadInvestors") or []) if i]
                others = [str(i) for i in (r.get("otherInvestors") or []) if i]
                all_investors.extend(leads)
                all_investors.extend(others)
                metrics.funding_rounds.append(
                    FundingRound(
                        round_name=str(r.get("round") or "Undisclosed"),
                        amount_usd_millions=amt_float,
                        date=str(r.get("date")) if r.get("date") else None,
                        lead_investors=leads,
                        other_investors=others,
                    )
                )

            if total_millions > 0:
                metrics.total_funding_usd = round(total_millions * 1_000_000, 2)
            # Deduplicate preserving order
            metrics.investors = list(dict.fromkeys(all_investors))
            metrics.source_notes.append(
                f"Found {len(matched_raises)} funding round(s) on DefiLlama Raises totaling ${total_millions:.2f}M."
            )
        else:
            metrics.source_notes.append(
                "No public funding rounds matched on DefiLlama Raises."
            )

        return metrics
