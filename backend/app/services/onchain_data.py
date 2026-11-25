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
DEFILLAMA_CHAINS_URL = "https://api.llama.fi/v2/chains"
DEFILLAMA_PROTOCOL_DETAIL_URL = "https://api.llama.fi/protocol/{slug}"

# In-memory TTL cache to avoid re-fetching DefiLlama catalogs on every request
_CACHE: Dict[str, Any] = {
    "protocols": {"data": None, "fetched_at": 0.0, "ttl": 900.0},
    "chains": {"data": None, "fetched_at": 0.0, "ttl": 900.0},
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
    description: Optional[str] = None
    official_url: Optional[str] = None
    chains: List[str] = field(default_factory=list)
    tvl_usd: Optional[float] = None
    tvl_change_1d: Optional[float] = None
    tvl_change_7d: Optional[float] = None
    mcap_usd: Optional[float] = None
    token_symbol: Optional[str] = None
    audits_count: int = 0
    audit_links: List[str] = field(default_factory=list)
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
        for prefix in ("www.", "app.", "docs.", "trade.", "earn.", "bridge."):
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
            return entry["data"]

    async def _fetch_protocol_detail(self, slug: str) -> Optional[Dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.get(DEFILLAMA_PROTOCOL_DETAIL_URL.format(slug=slug))
                if resp.status_code == 200:
                    return resp.json()
        except Exception as exc:
            logger.warning("DefiLlama protocol detail failed for %s: %s", slug, exc)
        return None

    async def fetch_metrics(
        self, project_name: str, domain: str
    ) -> OnChainMetrics:
        metrics = OnChainMetrics()
        target_domain = _extract_root_domain(domain)
        target_key = _normalize_key(project_name)
        domain_key = _normalize_key(target_domain.split(".")[0]) if target_domain else ""

        # 1. DefiLlama Protocols catalog
        protocols = await self._get_cached_json("protocols", DEFILLAMA_PROTOCOLS_URL)
        matched_proto: Optional[Dict[str, Any]] = None

        if isinstance(protocols, list):
            # Prefer exact root-domain matches with highest TVL
            domain_matches = [
                p
                for p in protocols
                if target_domain and _extract_root_domain(p.get("url")) == target_domain
            ]
            if domain_matches:
                domain_matches.sort(key=lambda p: float(p.get("tvl") or 0), reverse=True)
                matched_proto = domain_matches[0]

            if not matched_proto:
                name_matches = [
                    p
                    for p in protocols
                    if _normalize_key(str(p.get("name", ""))) in {target_key, domain_key}
                    or _normalize_key(str(p.get("slug", ""))) in {target_key, domain_key}
                ]
                if name_matches:
                    name_matches.sort(key=lambda p: float(p.get("tvl") or 0), reverse=True)
                    matched_proto = name_matches[0]

        if matched_proto:
            metrics.matched_protocol = matched_proto.get("name")
            metrics.slug = matched_proto.get("slug")
            metrics.category = matched_proto.get("category")
            metrics.official_url = matched_proto.get("url")
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

            # 2. Enrich from free /protocol/{slug} detail endpoint (raises, audits, description)
            if metrics.slug:
                detail = await self._fetch_protocol_detail(metrics.slug)
                if isinstance(detail, dict):
                    if detail.get("description"):
                        metrics.description = str(detail["description"])
                    if detail.get("audits"):
                        try:
                            metrics.audits_count = int(detail["audits"])
                        except (ValueError, TypeError):
                            metrics.audits_count = 1
                    audit_links = detail.get("audit_links")
                    if isinstance(audit_links, list):
                        metrics.audit_links = [str(u) for u in audit_links if u]
                        if metrics.audit_links and metrics.audits_count == 0:
                            metrics.audits_count = len(metrics.audit_links)

                    raises = detail.get("raises")
                    if isinstance(raises, list) and raises:
                        total_millions = 0.0
                        all_investors: List[str] = []
                        for r in raises:
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
                        metrics.investors = list(dict.fromkeys(all_investors))
                        metrics.source_notes.append(
                            f"Found {len(raises)} funding round(s) via DefiLlama protocol detail "
                            f"(investors: {', '.join(metrics.investors[:5]) or 'undisclosed'})."
                        )
        else:
            metrics.source_notes.append(
                "Not yet indexed on DefiLlama protocols catalog."
            )

        # 3. DefiLlama v2/chains (essential for L1/L2 networks like Berachain, Monad, Arbitrum, Base)
        chains_catalog = await self._get_cached_json("chains", DEFILLAMA_CHAINS_URL)
        if isinstance(chains_catalog, list):
            for ch in chains_catalog:
                ch_key = _normalize_key(str(ch.get("name", "")))
                if ch_key in {target_key, domain_key}:
                    ch_tvl = ch.get("tvl")
                    ch_tvl_float = float(ch_tvl) if ch_tvl is not None else None
                    if ch_tvl_float and (
                        metrics.tvl_usd is None or ch_tvl_float > metrics.tvl_usd
                    ):
                        metrics.tvl_usd = ch_tvl_float
                    if not metrics.matched_protocol:
                        metrics.matched_protocol = ch.get("name")
                        metrics.category = "Layer 1 / Layer 2 Chain"
                    elif metrics.category == "Chain Bribes":
                        metrics.category = "Layer 1 / Layer 2 Chain"
                    if ch.get("name") and ch["name"] not in metrics.chains:
                        metrics.chains.insert(0, str(ch["name"]))
                    if not metrics.token_symbol and ch.get("tokenSymbol"):
                        metrics.token_symbol = str(ch["tokenSymbol"])
                    metrics.source_notes.append(
                        f"Matched DefiLlama Chain '{ch.get('name')}' (Chain TVL: ${ch_tvl_float or 0:,.0f})."
                    )
                    break

        return metrics
