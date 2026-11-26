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
DEFILLAMA_FEES_SUMMARY_URL = "https://api.llama.fi/summary/fees/{slug}"
DEFILLAMA_HACKS_URL = "https://api.llama.fi/hacks"

# In-memory TTL cache to avoid re-fetching DefiLlama catalogs on every request
_CACHE: Dict[str, Any] = {
    "protocols": {"data": None, "fetched_at": 0.0, "ttl": 900.0},
    "chains": {"data": None, "fetched_at": 0.0, "ttl": 900.0},
    "hacks": {"data": None, "fetched_at": 0.0, "ttl": 1800.0},
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
    chain_tvls: Dict[str, float] = field(default_factory=dict)
    tvl_usd: Optional[float] = None
    tvl_change_1d: Optional[float] = None
    tvl_change_7d: Optional[float] = None
    mcap_usd: Optional[float] = None
    fdv_usd: Optional[float] = None
    current_price_usd: Optional[float] = None
    total_supply: Optional[float] = None
    circulating_supply: Optional[float] = None
    max_supply: Optional[float] = None
    gecko_id: Optional[str] = None
    token_symbol: Optional[str] = None
    audits_count: int = 0
    audit_links: List[str] = field(default_factory=list)
    fees_24h_usd: Optional[float] = None
    fees_30d_usd: Optional[float] = None
    fees_all_time_usd: Optional[float] = None
    hacks_history: List[Dict[str, Any]] = field(default_factory=list)
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

    async def _fetch_fees_summary(self, slug: str) -> Optional[Dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=12.0) as client:
                resp = await client.get(DEFILLAMA_FEES_SUMMARY_URL.format(slug=slug))
                if resp.status_code == 200:
                    return resp.json()
        except Exception as exc:
            logger.debug("DefiLlama fees summary not available for %s: %s", slug, exc)
        return None

    async def _fetch_coingecko_supply(self, gecko_id: str) -> Optional[Dict[str, Any]]:
        """Fetch live Total Supply, Circulating Supply, Max Supply, Price, and FDV from CoinGecko."""
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.get(
                    f"https://api.coingecko.com/api/v3/coins/{gecko_id}"
                    "?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false"
                )
                if resp.status_code == 200:
                    return resp.json().get("market_data")
        except Exception as exc:
            logger.debug("CoinGecko supply fetch skipped for %s: %s", gecko_id, exc)
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
            if matched_proto.get("gecko_id"):
                metrics.gecko_id = str(matched_proto["gecko_id"])
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
                    current_chain_tvls = detail.get("currentChainTvls")
                    if isinstance(current_chain_tvls, dict):
                        skip_suffixes = ("-borrowed", "-staking", "-pool2", "-vesting", "-offers", "-treasury")
                        skip_names = {"borrowed", "staking", "pool2", "vesting", "offers", "treasury"}
                        clean_ctvls: Dict[str, float] = {}
                        for cname, cval in current_chain_tvls.items():
                            low_c = str(cname).lower()
                            if low_c in skip_names or any(low_c.endswith(s) for s in skip_suffixes):
                                continue
                            try:
                                fval = float(cval)
                                if fval > 0:
                                    clean_ctvls[str(cname)] = round(fval, 2)
                            except (TypeError, ValueError):
                                continue
                        # Sort descending by TVL
                        metrics.chain_tvls = dict(
                            sorted(clean_ctvls.items(), key=lambda kv: kv[1], reverse=True)
                        )
                        for cname in metrics.chain_tvls:
                            if cname not in metrics.chains:
                                metrics.chains.append(cname)
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
                    if not metrics.gecko_id and ch.get("gecko_id"):
                        metrics.gecko_id = str(ch["gecko_id"])
                    metrics.source_notes.append(
                        f"Matched DefiLlama Chain '{ch.get('name')}' (Chain TVL: ${ch_tvl_float or 0:,.0f})."
                    )
                    break

        # 4. DefiLlama Fees / Revenue summary (real on-chain cashflow)
        fee_slug = metrics.slug or domain_key
        if fee_slug:
            fees_data = await self._fetch_fees_summary(fee_slug)
            if isinstance(fees_data, dict):
                t24 = fees_data.get("total24h")
                t30 = fees_data.get("total30d")
                tall = fees_data.get("totalAllTime")
                metrics.fees_24h_usd = float(t24) if t24 is not None else None
                metrics.fees_30d_usd = float(t30) if t30 is not None else None
                metrics.fees_all_time_usd = float(tall) if tall is not None else None
                if metrics.fees_30d_usd:
                    metrics.source_notes.append(
                        f"DefiLlama Fees 30d: ${metrics.fees_30d_usd:,.0f}."
                    )

        # 5. DefiLlama Hacks / Exploits database check
        hacks_catalog = await self._get_cached_json("hacks", DEFILLAMA_HACKS_URL)
        if isinstance(hacks_catalog, list):
            match_keys = {k for k in (target_key, domain_key) if len(k) >= 4}
            if metrics.matched_protocol:
                match_keys.add(_normalize_key(metrics.matched_protocol))
            if metrics.slug:
                match_keys.add(_normalize_key(metrics.slug))

            for h in hacks_catalog:
                h_key = _normalize_key(str(h.get("name", "")))
                if h_key and h_key in match_keys:
                    ts = h.get("date")
                    date_str = None
                    if isinstance(ts, (int, float)):
                        from datetime import datetime, timezone

                        date_str = datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")
                    metrics.hacks_history.append(
                        {
                            "name": str(h.get("name", "")),
                            "date": date_str,
                            "amount_usd": float(h["amount"]) if h.get("amount") is not None else None,
                            "classification": str(h.get("classification") or "Unknown"),
                            "technique": str(h.get("technique") or "Undisclosed"),
                        }
                    )

        # 6. CoinGecko Total Supply, Circulating Supply, Price & FDV (free public API)
        if metrics.gecko_id:
            md = await self._fetch_coingecko_supply(metrics.gecko_id)
            if isinstance(md, dict):
                ts = md.get("total_supply")
                cs = md.get("circulating_supply")
                ms = md.get("max_supply")
                metrics.total_supply = float(ts) if ts is not None else None
                metrics.circulating_supply = float(cs) if cs is not None else None
                metrics.max_supply = float(ms) if ms is not None else None
                cp = (md.get("current_price") or {}).get("usd")
                fdv = (md.get("fully_diluted_valuation") or {}).get("usd")
                mc = (md.get("market_cap") or {}).get("usd")
                if cp is not None:
                    metrics.current_price_usd = float(cp)
                if fdv is not None:
                    metrics.fdv_usd = float(fdv)
                if mc is not None and metrics.mcap_usd is None:
                    metrics.mcap_usd = float(mc)

        return metrics

    async def discover_tokenless_gems(
        self,
        min_tvl: float = 100_000,
        max_tvl: float = 1_000_000_000,
        chain: Optional[str] = None,
        search: Optional[str] = None,
        sort: str = "profitability",
        limit: int = 24,
    ) -> List[Dict[str, Any]]:
        """Discover emerging, lesser-known, tokenless Web3 protocols from DefiLlama."""
        protocols = await self._get_cached_json("protocols", DEFILLAMA_PROTOCOLS_URL)
        if not isinstance(protocols, list):
            return []

        excluded_categories = {"CEX", "Chain"}
        high_alpha_categories = {
            "derivatives",
            "perp",
            "dexes",
            "dexs",
            "lending",
            "restaking",
            "liquid restaking",
            "liquid staking",
            "yield",
            "basis trading",
            "cdp",
            "rwa",
            "bridge",
        }
        chain_needle = chain.strip().lower() if chain else ""
        search_needle = search.strip().lower() if search else ""
        now_ts = time.time()

        # When user explicitly wants biggest TVL, don't cap at $150M
        effective_max_tvl = max(max_tvl, 50_000_000_000) if sort == "tvl_desc" else max_tvl

        candidates: List[Dict[str, Any]] = []
        for p in protocols:
            symbol = str(p.get("symbol") or "").strip()
            # Tokenless filter: DefiLlama uses "-" or empty string for tokenless protocols
            if symbol and symbol != "-":
                continue

            tvl = p.get("tvl")
            if tvl is None:
                continue
            try:
                tvl_f = float(tvl)
            except (TypeError, ValueError):
                continue

            if tvl_f < min_tvl or tvl_f > effective_max_tvl:
                continue

            category = str(p.get("category") or "DeFi")
            if category in excluded_categories:
                continue

            url = str(p.get("url") or "").strip()
            if not url.startswith("http"):
                continue

            chains = [str(c) for c in (p.get("chains") or [])]
            if chain_needle and not any(chain_needle in c.lower() for c in chains):
                continue

            name = str(p.get("name") or "")
            if search_needle and (
                search_needle not in name.lower()
                and search_needle not in category.lower()
                and not any(search_needle in c.lower() for c in chains)
            ):
                continue

            c7d = p.get("change_7d")
            c7d_f = float(c7d) if isinstance(c7d, (int, float)) else None
            twitter = p.get("twitter")
            listed_raw = p.get("listedAt")
            listed_ts = int(listed_raw) if isinstance(listed_raw, (int, float)) and listed_raw > 0 else None

            # Compute Alpha Profitability / Airdrop Probability Score (0-100)
            alpha = 35
            # Sweet-spot TVL: proven traction without extreme whale dilution
            if 5_000_000 <= tvl_f <= 150_000_000:
                alpha += 25
            elif 1_000_000 <= tvl_f < 5_000_000 or 150_000_000 < tvl_f <= 500_000_000:
                alpha += 18
            elif tvl_f > 500_000_000:
                alpha += 12
            else:
                alpha += 8

            # Positive 7d inflow momentum
            if c7d_f is not None:
                if c7d_f >= 25:
                    alpha += 18
                elif c7d_f >= 5:
                    alpha += 12
                elif c7d_f > 0:
                    alpha += 6
                elif c7d_f < -20:
                    alpha -= 8

            # Sector historically rewarding airdrops
            if category.lower() in high_alpha_categories:
                alpha += 10

            # Freshness / recency bonus
            if listed_ts:
                age_days = max(0, (now_ts - listed_ts) / 86400.0)
                if age_days <= 90:
                    alpha += 12
                elif age_days <= 240:
                    alpha += 6

            alpha_score = max(10, min(99, int(alpha)))

            candidates.append(
                {
                    "name": name,
                    "slug": str(p.get("slug") or ""),
                    "url": url,
                    "category": category,
                    "chains": chains[:6],
                    "tvl_usd": round(tvl_f, 2),
                    "tvl_change_7d": round(c7d_f, 2) if c7d_f is not None else None,
                    "twitter_url": f"https://x.com/{twitter}" if twitter else None,
                    "listed_at": listed_ts,
                    "alpha_score": alpha_score,
                }
            )

        if sort == "tvl_desc":
            candidates.sort(key=lambda item: item["tvl_usd"], reverse=True)
        elif sort == "newest":
            candidates.sort(
                key=lambda item: (item["listed_at"] or 0, item["tvl_usd"]),
                reverse=True,
            )
        elif sort == "growth_7d":
            candidates.sort(
                key=lambda item: (
                    item["tvl_change_7d"] if item["tvl_change_7d"] is not None else -9999.0,
                    item["tvl_usd"],
                ),
                reverse=True,
            )
        else:
            # Default: profitability / highest airdrop probability
            candidates.sort(
                key=lambda item: (
                    item["alpha_score"],
                    item["tvl_change_7d"] if item["tvl_change_7d"] is not None else -9999.0,
                    item["tvl_usd"],
                ),
                reverse=True,
            )

        return candidates[: max(1, min(limit, 60))]
