from __future__ import annotations

import hashlib
import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

from app.config import get_settings

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/128.0.0.0 Safari/537.36 AirdropAlphaBot/1.0"
)


@dataclass
class GitHubMetrics:
    url: str
    stars: Optional[int] = None
    repos_count: Optional[int] = None
    last_push: Optional[str] = None
    top_languages: List[str] = field(default_factory=list)
    summary: str = ""


@dataclass
class ScrapedProjectData:
    url: str
    domain: str
    inferred_name: str
    title: str = ""
    meta_description: str = ""
    main_text: str = ""
    docs_url: Optional[str] = None
    docs_text: str = ""
    roadmap_url: Optional[str] = None
    roadmap_text: str = ""
    github_url: Optional[str] = None
    twitter_url: Optional[str] = None
    discord_url: Optional[str] = None
    telegram_url: Optional[str] = None
    instagram_url: Optional[str] = None
    extra_links: List[Dict[str, str]] = field(default_factory=list)
    detected_chains: List[str] = field(default_factory=list)
    github_metrics: Optional[GitHubMetrics] = None
    monitored_url: str = ""
    content_hash: str = ""
    monitored_text_snapshot: str = ""
    warnings: List[str] = field(default_factory=list)


def normalize_url(raw_url: str) -> str:
    url = raw_url.strip()
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    parsed = urlparse(url)
    clean_path = parsed.path.rstrip("/") or ""
    return f"{parsed.scheme}://{parsed.netloc.lower()}{clean_path}"


def extract_domain(url: str) -> str:
    netloc = urlparse(url).netloc.lower()
    for prefix in ("www.", "app.", "docs."):
        if netloc.startswith(prefix):
            netloc = netloc[len(prefix) :]
    return netloc


def infer_name_from_domain(domain: str) -> str:
    base = domain.split(".")[0]
    cleaned = re.sub(r"[-_]+", " ", base).strip()
    return cleaned.title() if cleaned else domain


def clean_text_for_hash(text: str) -> str:
    """Normalize text and strip volatile noise (dates, counters, whitespace) for stable diffing."""
    lines = []
    for raw_line in text.splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if len(line) < 4:
            continue
        # Skip pure numeric counters or timestamps that cause false-positive alerts
        if re.fullmatch(r"[\d,.$%+\-\s:/]+", line):
            continue
        lines.append(line)
    return "\n".join(lines)


def compute_content_hash(text: str) -> str:
    normalized = clean_text_for_hash(text)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


KNOWN_CHAINS = [
    ("Ethereum", r"\bethereum\b|\bmainnet\b"),
    ("Arbitrum", r"\barbitrum\b"),
    ("Base", r"\bbase chain\b|\bon base\b|\bbase network\b|\bbase l2\b"),
    ("Optimism", r"\boptimism\b|\bop mainnet\b"),
    ("Solana", r"\bsolana\b"),
    ("Berachain", r"\bberachain\b"),
    ("Hyperliquid", r"\bhyperliquid\b|\bhyperevm\b"),
    ("Monad", r"\bmonad\b"),
    ("MegaETH", r"\bmegaeth\b"),
    ("Polygon", r"\bpolygon\b"),
    ("Avalanche", r"\bavalanche\b|\bavax\b"),
    ("BNB Chain", r"\bbnb chain\b|\bbnb smart chain\b|\bbsc\b"),
    ("Sui", r"\bsui network\b|\bon sui\b"),
    ("Aptos", r"\baptos\b"),
    ("Starknet", r"\bstarknet\b"),
    ("zkSync", r"\bzksync\b"),
    ("Linea", r"\blinea\b"),
    ("Scroll", r"\bscroll\b"),
    ("Mantle", r"\bmantle\b"),
    ("Blast", r"\bblast\b"),
    ("TON", r"\bton blockchain\b|\bthe open network\b"),
    ("Sei", r"\bsei network\b|\bsei v2\b"),
    ("Sonic", r"\bsonic\b"),
]


def detect_chains_in_text(text: str) -> List[str]:
    low = text.lower()
    found: List[str] = []
    for chain_name, pattern in KNOWN_CHAINS:
        if re.search(pattern, low):
            found.append(chain_name)
    return found


def extract_clean_text_from_html(html: str, max_chars: int = 14000) -> Tuple[str, str, str]:
    soup = BeautifulSoup(html, "html.parser")

    title = soup.title.get_text(" ", strip=True) if soup.title else ""
    meta_desc = ""
    meta_tag = soup.find("meta", attrs={"name": "description"}) or soup.find(
        "meta", attrs={"property": "og:description"}
    )
    if meta_tag and meta_tag.get("content"):
        meta_desc = str(meta_tag["content"]).strip()

    for tag in soup(["script", "style", "noscript", "svg", "iframe", "canvas"]):
        tag.decompose()

    # Keep semantic content lines
    text = soup.get_text(separator="\n")
    cleaned = clean_text_for_hash(text)
    return title, meta_desc, cleaned[:max_chars]


class Web3Scraper:
    def __init__(self, timeout: float = 18.0) -> None:
        self.timeout = timeout
        self.settings = get_settings()

    def _default_headers(self) -> Dict[str, str]:
        return {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

    async def fetch_html(
        self, client: httpx.AsyncClient, url: str
    ) -> Tuple[Optional[str], Optional[str]]:
        try:
            resp = await client.get(
                url,
                headers=self._default_headers(),
                follow_redirects=True,
                timeout=self.timeout,
            )
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")
            if "html" not in content_type and "text" not in content_type:
                return None, f"Non-HTML content-type ({content_type}) at {url}"
            return resp.text, None
        except Exception as exc:
            logger.warning("Failed to fetch %s: %s", url, exc)
            return None, f"Could not fetch {url}: {exc}"

    def _discover_links(self, html: str, base_url: str) -> Tuple[Dict[str, Optional[str]], List[Dict[str, str]]]:
        soup = BeautifulSoup(html, "html.parser")
        links: Dict[str, Optional[str]] = {
            "docs": None,
            "roadmap": None,
            "github": None,
            "twitter": None,
            "discord": None,
            "telegram": None,
            "instagram": None,
        }
        extras: List[Dict[str, str]] = []
        seen_extra: set[str] = set()

        # Check meta twitter:site / twitter:creator
        for meta_name in ("twitter:site", "twitter:creator"):
            tag = soup.find("meta", attrs={"name": meta_name})
            if tag and tag.get("content") and not links["twitter"]:
                handle = str(tag["content"]).strip().lstrip("@")
                if handle and " " not in handle and "/" not in handle:
                    links["twitter"] = f"https://x.com/{handle}"

        for a in soup.find_all("a", href=True):
            raw_href = str(a["href"]).strip()
            if not raw_href or raw_href.startswith(("#", "mailto:", "javascript:")):
                continue

            full_url = urljoin(base_url, raw_href)
            lower_url = full_url.lower()
            anchor_text = a.get_text(" ", strip=True).lower()

            if not links["github"] and "github.com/" in lower_url:
                parsed = urlparse(full_url)
                parts = [p for p in parsed.path.split("/") if p]
                if parts:
                    links["github"] = f"https://github.com/{'/'.join(parts[:2])}"

            if not links["twitter"] and (
                "twitter.com/" in lower_url or "x.com/" in lower_url
            ):
                if "/intent/" not in lower_url and "/share" not in lower_url:
                    links["twitter"] = full_url

            if not links["discord"] and (
                "discord.gg/" in lower_url or "discord.com/invite" in lower_url
            ):
                links["discord"] = full_url

            if not links["telegram"] and (
                "t.me/" in lower_url or "telegram.me/" in lower_url
            ):
                links["telegram"] = full_url

            if not links["instagram"] and "instagram.com/" in lower_url:
                links["instagram"] = full_url

            if not links["docs"] and (
                "docs." in lower_url
                or "gitbook.io" in lower_url
                or "/docs" in lower_url
                or "documentation" in lower_url
                or anchor_text in {"docs", "documentation", "developers", "whitepaper", "litepaper"}
            ):
                if "github.com" not in lower_url:
                    links["docs"] = full_url

            if not links["roadmap"] and (
                "roadmap" in lower_url
                or "tokenomics" in lower_url
                or "roadmap" in anchor_text
                or "milestones" in anchor_text
            ):
                links["roadmap"] = full_url

            # Capture additional ecosystem channels
            for label, kind, match_fn in (
                ("YouTube", "youtube", lambda u: "youtube.com/" in u or "youtu.be/" in u),
                ("LinkedIn", "linkedin", lambda u: "linkedin.com/" in u),
                ("Medium", "blog", lambda u: "medium.com/" in u),
                ("Mirror", "blog", lambda u: "mirror.xyz" in u),
                ("Blog", "blog", lambda u: "/blog" in u or "blog." in u),
                ("Governance / Snapshot", "governance", lambda u: "snapshot.org" in u or "tally.xyz" in u),
                ("Galxe / Guild", "community", lambda u: "galxe.com" in u or "guild.xyz" in u or "zealy.io" in u),
            ):
                if match_fn(lower_url) and full_url not in seen_extra:
                    seen_extra.add(full_url)
                    extras.append({"label": label, "type": kind, "url": full_url})

        return links, extras

    async def fetch_github_metrics(
        self, client: httpx.AsyncClient, github_url: str
    ) -> Optional[GitHubMetrics]:
        parsed = urlparse(github_url)
        parts = [p for p in parsed.path.split("/") if p]
        if not parts:
            return None

        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": USER_AGENT,
        }
        if self.settings.github_token:
            headers["Authorization"] = f"Bearer {self.settings.github_token}"

        owner = parts[0]
        repo = parts[1] if len(parts) >= 2 else None

        try:
            if repo:
                resp = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo}",
                    headers=headers,
                    timeout=10.0,
                )
                if resp.status_code == 200:
                    data: Dict[str, Any] = resp.json()
                    lang = data.get("language")
                    return GitHubMetrics(
                        url=github_url,
                        stars=data.get("stargazers_count"),
                        repos_count=1,
                        last_push=data.get("pushed_at"),
                        top_languages=[lang] if lang else [],
                        summary=(
                            f"Repo {owner}/{repo}: {data.get('stargazers_count', 0)} stars, "
                            f"forks={data.get('forks_count', 0)}, last push={data.get('pushed_at')}"
                        ),
                    )

            # Fallback to organization / user repos endpoint
            org_resp = await client.get(
                f"https://api.github.com/users/{owner}/repos?sort=pushed&per_page=15",
                headers=headers,
                timeout=10.0,
            )
            if org_resp.status_code == 200:
                repos = org_resp.json()
                if isinstance(repos, list) and repos:
                    total_stars = sum(int(r.get("stargazers_count", 0)) for r in repos)
                    latest_push = repos[0].get("pushed_at")
                    langs = list(
                        dict.fromkeys(
                            r.get("language") for r in repos if r.get("language")
                        )
                    )[:4]
                    return GitHubMetrics(
                        url=f"https://github.com/{owner}",
                        stars=total_stars,
                        repos_count=len(repos),
                        last_push=latest_push,
                        top_languages=langs,
                        summary=(
                            f"Org {owner}: {len(repos)}+ public repos, {total_stars} total stars, "
                            f"latest push={latest_push}, languages={', '.join(langs)}"
                        ),
                    )
        except Exception as exc:
            logger.warning("GitHub API fetch failed for %s: %s", github_url, exc)

        return GitHubMetrics(url=github_url, summary="GitHub link found (API rate-limited or private)")

    async def fetch_jina_markdown(
        self, client: httpx.AsyncClient, url: str
    ) -> Optional[str]:
        """Fallback renderer for JS-heavy SPAs using Jina Reader (returns clean Markdown)."""
        try:
            resp = await client.get(
                f"https://r.jina.ai/{url}",
                headers={"Accept": "text/plain", "User-Agent": USER_AGENT},
                follow_redirects=True,
                timeout=14.0,
            )
            if resp.status_code == 200 and len(resp.text.strip()) > 120:
                return resp.text[:14000]
        except Exception as exc:
            logger.debug("Jina Reader fallback failed for %s: %s", url, exc)
        return None

    def _discover_links_from_text(self, text: str) -> Tuple[Dict[str, Optional[str]], List[Dict[str, str]]]:
        """Extract docs, github, twitter, discord, telegram, instagram & extra URLs from text."""
        found: Dict[str, Optional[str]] = {
            "docs": None,
            "roadmap": None,
            "github": None,
            "twitter": None,
            "discord": None,
            "telegram": None,
            "instagram": None,
        }
        extras: List[Dict[str, str]] = []
        seen_extra: set[str] = set()
        urls = re.findall(r"https?://[^\s\)\]\>\"']+", text)
        for u in urls:
            u = u.rstrip(".,;:")
            low = u.lower()
            if not found["github"] and "github.com/" in low:
                parts = [p for p in urlparse(u).path.split("/") if p]
                if parts:
                    found["github"] = f"https://github.com/{'/'.join(parts[:2])}"
            if not found["twitter"] and ("twitter.com/" in low or "x.com/" in low):
                if "/intent/" not in low and "/share" not in low:
                    found["twitter"] = u
            if not found["discord"] and ("discord.gg/" in low or "discord.com/invite" in low):
                found["discord"] = u
            if not found["telegram"] and ("t.me/" in low or "telegram.me/" in low):
                found["telegram"] = u
            if not found["instagram"] and "instagram.com/" in low:
                found["instagram"] = u
            if not found["docs"] and (
                "docs." in low or "gitbook.io" in low or "/docs" in low
            ):
                if "github.com" not in low:
                    found["docs"] = u
            if not found["roadmap"] and ("roadmap" in low or "tokenomics" in low):
                found["roadmap"] = u
            for label, kind, match_fn in (
                ("YouTube", "youtube", lambda s: "youtube.com/" in s or "youtu.be/" in s),
                ("LinkedIn", "linkedin", lambda s: "linkedin.com/" in s),
                ("Medium", "blog", lambda s: "medium.com/" in s),
                ("Mirror", "blog", lambda s: "mirror.xyz" in s),
                ("Governance", "governance", lambda s: "snapshot.org" in s or "tally.xyz" in s),
            ):
                if match_fn(low) and u not in seen_extra:
                    seen_extra.add(u)
                    extras.append({"label": label, "type": kind, "url": u})
        return found, extras

    async def scrape_project(
        self, url: str, explicit_docs_url: Optional[str] = None
    ) -> ScrapedProjectData:
        normalized = normalize_url(url)
        domain = extract_domain(normalized)
        inferred_name = infer_name_from_domain(domain)

        result = ScrapedProjectData(
            url=normalized,
            domain=domain,
            inferred_name=inferred_name,
            docs_url=normalize_url(explicit_docs_url) if explicit_docs_url else None,
        )

        def _merge_links(discovered_map: Dict[str, Optional[str]], extra_list: List[Dict[str, str]]) -> None:
            for key, attr in (
                ("docs", "docs_url"),
                ("roadmap", "roadmap_url"),
                ("github", "github_url"),
                ("twitter", "twitter_url"),
                ("discord", "discord_url"),
                ("telegram", "telegram_url"),
                ("instagram", "instagram_url"),
            ):
                if not getattr(result, attr) and discovered_map.get(key):
                    setattr(result, attr, discovered_map[key])
            existing_extra_urls = {item["url"] for item in result.extra_links}
            for item in extra_list:
                if item["url"] not in existing_extra_urls:
                    existing_extra_urls.add(item["url"])
                    result.extra_links.append(item)

        async with httpx.AsyncClient() as client:
            main_html, err = await self.fetch_html(client, normalized)
            if err:
                result.warnings.append(err)

            if main_html:
                title, meta_desc, text = extract_clean_text_from_html(main_html)
                result.title = title
                result.meta_description = meta_desc
                result.main_text = text

                discovered, extras = self._discover_links(main_html, normalized)
                _merge_links(discovered, extras)

            # If user pasted an app.* / trade.* subdomain, also probe the root landing domain
            root_url = f"https://{domain}"
            if root_url != normalized:
                root_html, _ = await self.fetch_html(client, root_url)
                if root_html:
                    r_title, r_meta, r_text = extract_clean_text_from_html(root_html)
                    if len(r_text) > len(result.main_text):
                        result.main_text = r_text
                        result.title = result.title or r_title
                        result.meta_description = result.meta_description or r_meta
                    r_links, r_extras = self._discover_links(root_html, root_url)
                    _merge_links(r_links, r_extras)

            # SPA fallback: if raw HTML had almost no readable text, render via Jina Reader
            if len(result.main_text) < 300:
                jina_target = root_url if root_url != normalized else normalized
                md_text = await self.fetch_jina_markdown(client, jina_target)
                if md_text:
                    result.main_text = clean_text_for_hash(md_text)[:12000]
                    md_links, md_extras = self._discover_links_from_text(md_text)
                    _merge_links(md_links, md_extras)

            # Probe docs.<domain> automatically if docs_url is still unknown
            if not result.docs_url and domain:
                candidate_docs = f"https://docs.{domain}"
                docs_html, _ = await self.fetch_html(client, candidate_docs)
                if docs_html:
                    _, _, docs_text = extract_clean_text_from_html(docs_html, max_chars=12000)
                    if len(docs_text) > 150:
                        result.docs_url = candidate_docs
                        result.docs_text = docs_text
                        d_links, d_extras = self._discover_links(docs_html, candidate_docs)
                        _merge_links(d_links, d_extras)

            # Scrape Docs / GitBook if discovered or provided
            if result.docs_url and not result.docs_text and result.docs_url != normalized:
                docs_html, docs_err = await self.fetch_html(client, result.docs_url)
                if docs_err:
                    result.warnings.append(docs_err)
                elif docs_html:
                    _, _, docs_text = extract_clean_text_from_html(docs_html, max_chars=12000)
                    result.docs_text = docs_text
                    d_links, d_extras = self._discover_links(docs_html, result.docs_url)
                    _merge_links(d_links, d_extras)

            # Scrape Roadmap page if discovered
            if result.roadmap_url and result.roadmap_url not in {normalized, result.docs_url}:
                rm_html, _ = await self.fetch_html(client, result.roadmap_url)
                if rm_html:
                    _, _, rm_text = extract_clean_text_from_html(rm_html, max_chars=8000)
                    result.roadmap_text = rm_text

            # Fetch GitHub metrics if available
            if result.github_url:
                result.github_metrics = await self.fetch_github_metrics(
                    client, result.github_url
                )

        result.detected_chains = detect_chains_in_text(
            f"{result.title} {result.meta_description} {result.main_text[:5000]} {result.docs_text[:4000]}"
        )

        # Decide best URL to monitor for future roadmap/docs updates
        if result.roadmap_url and result.roadmap_text:
            result.monitored_url = result.roadmap_url
            result.monitored_text_snapshot = result.roadmap_text
        elif result.docs_url and result.docs_text:
            result.monitored_url = result.docs_url
            result.monitored_text_snapshot = result.docs_text
        else:
            result.monitored_url = result.url
            result.monitored_text_snapshot = result.main_text

        result.content_hash = compute_content_hash(result.monitored_text_snapshot)
        return result

    async def fetch_monitored_page(self, url: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Fetch a monitored page and return (clean_text, sha256_hash, error)."""
        async with httpx.AsyncClient() as client:
            html, err = await self.fetch_html(client, url)
            if err or not html:
                return None, None, err or "Empty response"
            _, _, clean_text = extract_clean_text_from_html(html, max_chars=14000)
            return clean_text, compute_content_hash(clean_text), None
