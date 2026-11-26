from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus

import httpx

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36"
)


def _slug_variants(name: str, slug: str) -> List[str]:
    base = re.sub(r"[^a-z0-9]+", "-", (slug or name).lower()).strip("-")
    compact = re.sub(r"[^a-z0-9]+", "", (slug or name).lower())
    first_word = base.split("-")[0] if base else ""
    variants = [v for v in (base, compact, first_word) if v and len(v) >= 3]
    return list(dict.fromkeys(variants))


async def _check_single_platform(
    client: httpx.AsyncClient,
    platform: str,
    key: str,
    home_url: str,
    candidate_urls: List[str],
    search_url: str,
    project_name: str,
    slug: str,
) -> Dict[str, Any]:
    name_tokens = [
        t for t in re.split(r"[^a-z0-9]+", project_name.lower()) if len(t) >= 3
    ]
    slug_clean = re.sub(r"[^a-z0-9]+", "", (slug or project_name).lower())

    blocked = False
    for url in candidate_urls:
        try:
            resp = await client.get(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.9",
                },
                follow_redirects=True,
                timeout=5.5,
            )
            if resp.status_code == 200:
                body_low = resp.text[:15000].lower()
                # Verify it's not a soft 404 / generic error page
                if (
                    "page not found" in body_low
                    or "<title>404" in body_low
                    or "nothing found" in body_low
                ):
                    continue
                if any(tok in body_low for tok in name_tokens) or (
                    slug_clean and slug_clean in re.sub(r"[^a-z0-9]+", "", body_low[:6000])
                ):
                    return {
                        "platform": platform,
                        "key": key,
                        "listed": True,
                        "status_label": "Ranqueado",
                        "url": str(resp.url),
                        "search_url": search_url,
                        "home_url": home_url,
                    }
            elif resp.status_code in (403, 429, 503):
                blocked = True
            elif resp.status_code == 404:
                continue
        except Exception as exc:
            logger.debug("Tracker check failed for %s (%s): %s", platform, url, exc)
            blocked = True

    if blocked:
        return {
            "platform": platform,
            "key": key,
            "listed": None,
            "status_label": "Verificar",
            "url": search_url,
            "search_url": search_url,
            "home_url": home_url,
        }

    return {
        "platform": platform,
        "key": key,
        "listed": False,
        "status_label": "Não listado",
        "url": search_url,
        "search_url": search_url,
        "home_url": home_url,
    }


async def check_airdrop_platforms(
    project_name: str, slug: str
) -> List[Dict[str, Any]]:
    """Check whether the project is ranked/listed on the 5 top airdrop hunting platforms."""
    variants = _slug_variants(project_name, slug)
    primary = variants[0] if variants else "project"
    q = quote_plus(project_name)

    specs = [
        (
            "CryptoRank (Drop Hunting)",
            "cryptorank",
            "https://cryptorank.io/drophunting",
            [f"https://cryptorank.io/drophunting/{primary}"],
            f"https://cryptorank.io/drophunting?search={q}",
        ),
        (
            "DropsTab (Activities)",
            "dropstab",
            "https://dropstab.com/activities",
            [f"https://dropstab.com/coins/{primary}"],
            f"https://dropstab.com/activities?search={q}",
        ),
        (
            "Alpha Drops",
            "alphadrops",
            "https://alphadrops.net/",
            [f"https://alphadrops.net/alpha/{v}" for v in variants[:2]],
            f"https://alphadrops.net/?s={q}",
        ),
        (
            "DappRadar",
            "dappradar",
            "https://dappradar.com/",
            [f"https://dappradar.com/dapp/{primary}"],
            f"https://dappradar.com/rankings?search={q}",
        ),
        (
            "Airdrops.io",
            "airdropsio",
            "https://airdrops.io/",
            [f"https://airdrops.io/{v}/" for v in variants[:2]],
            f"https://airdrops.io/?s={q}",
        ),
    ]

    async with httpx.AsyncClient() as client:
        tasks = [
            _check_single_platform(
                client=client,
                platform=plat,
                key=key,
                home_url=home,
                candidate_urls=cands,
                search_url=s_url,
                project_name=project_name,
                slug=slug,
            )
            for plat, key, home, cands, s_url in specs
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    output: List[Dict[str, Any]] = []
    for res, spec in zip(results, specs):
        if isinstance(res, dict):
            output.append(res)
        else:
            output.append(
                {
                    "platform": spec[0],
                    "key": spec[1],
                    "listed": None,
                    "status_label": "Verificar",
                    "url": spec[4],
                    "search_url": spec[4],
                    "home_url": spec[2],
                }
            )
    return output


# ---------------------------------------------------------------------------
# Tokenomics Distribution Extractor (for Pie Chart)
# ---------------------------------------------------------------------------

TOKENOMICS_BUCKETS = [
    (
        "Comunidade & Airdrop",
        "community",
        "#10b981",
        r"(?:community|airdrop|rewards|incentives|users|retroactive|points)",
    ),
    (
        "Ecossistema & Tesouraria",
        "ecosystem",
        "#3b82f6",
        r"(?:ecosystem|treasury|grants|growth|dao|development)",
    ),
    (
        "Investidores & Backers",
        "investors",
        "#8b5cf6",
        r"(?:investors|backers|seed|private sale|vc|early backers|strategic)",
    ),
    (
        "Time & Contribuidores",
        "team",
        "#f59e0b",
        r"(?:team|core contributors|founders|advisors|contributors)",
    ),
    (
        "Liquidez & Fundação",
        "liquidity",
        "#06b6d4",
        r"(?:liquidity|market making|foundation|reserve|public sale|ido|ieo)",
    ),
]


def extract_tokenomics_distribution(
    text: str, is_tokenless: bool
) -> Dict[str, Any]:
    """Extract tokenomics percentage slices from docs/site text, or return a clear Pre-TGE benchmark."""
    extracted: Dict[str, float] = {}
    low_lines = [line.strip().lower() for line in text.splitlines() if "%" in line]

    for label, key, color, pattern in TOKENOMICS_BUCKETS:
        for line in low_lines:
            if len(line) > 180:
                continue
            if re.search(pattern, line):
                # Match percentage like 25%, 17.5%, 40 %
                m = re.search(r"(\d{1,2}(?:\.\d{1,2})?)\s*%", line)
                if m:
                    val = float(m.group(1))
                    if 1.0 <= val <= 85.0:
                        extracted[key] = max(extracted.get(key, 0.0), val)
                        break

    total = sum(extracted.values())
    if len(extracted) >= 2 and 35.0 <= total <= 115.0:
        slices: List[Dict[str, Any]] = []
        # Normalize to 100% if close or add "Outros" if < 95%
        if total < 95.0:
            for label, key, color, _ in TOKENOMICS_BUCKETS:
                if key in extracted:
                    slices.append(
                        {
                            "label": label,
                            "key": key,
                            "percentage": round(extracted[key], 1),
                            "color": color,
                        }
                    )
            remaining = round(100.0 - total, 1)
            if remaining > 0.5:
                slices.append(
                    {
                        "label": "Outros / Reserva",
                        "key": "other",
                        "percentage": remaining,
                        "color": "#71717a",
                    }
                )
        else:
            factor = 100.0 / total
            for label, key, color, _ in TOKENOMICS_BUCKETS:
                if key in extracted:
                    slices.append(
                        {
                            "label": label,
                            "key": key,
                            "percentage": round(extracted[key] * factor, 1),
                            "color": color,
                        }
                    )

        return {
            "source": "documentacao",
            "source_label": "Extraído da Documentação Oficial",
            "slices": slices,
        }

    # Transparent benchmark fallback when official tokenomics aren't published yet
    if is_tokenless:
        slices = [
            {"label": "Comunidade & Airdrop", "key": "community", "percentage": 30.0, "color": "#10b981"},
            {"label": "Ecossistema & Tesouraria", "key": "ecosystem", "percentage": 25.0, "color": "#3b82f6"},
            {"label": "Investidores & Backers", "key": "investors", "percentage": 20.0, "color": "#8b5cf6"},
            {"label": "Time & Contribuidores", "key": "team", "percentage": 18.0, "color": "#f59e0b"},
            {"label": "Liquidez & Fundação", "key": "liquidity", "percentage": 7.0, "color": "#06b6d4"},
        ]
        return {
            "source": "benchmark_pre_tge",
            "source_label": "Estimativa Benchmark Pré-TGE (Tokenomics não divulgada)",
            "slices": slices,
        }

    slices = [
        {"label": "Comunidade & Incentivos", "key": "community", "percentage": 35.0, "color": "#10b981"},
        {"label": "Ecossistema & Tesouraria", "key": "ecosystem", "percentage": 25.0, "color": "#3b82f6"},
        {"label": "Investidores", "key": "investors", "percentage": 18.0, "color": "#8b5cf6"},
        {"label": "Time & Advisors", "key": "team", "percentage": 15.0, "color": "#f59e0b"},
        {"label": "Liquidez & Reserva", "key": "liquidity", "percentage": 7.0, "color": "#06b6d4"},
    ]
    return {
        "source": "benchmark_mercado",
        "source_label": "Estimativa Benchmark (Alocação exata não encontrada nos docs)",
        "slices": slices,
    }
