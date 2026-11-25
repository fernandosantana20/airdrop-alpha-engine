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

    def _discover_links(self, html: str, base_url: str) -> Dict[str, Optional[str]]:
        soup = BeautifulSoup(html, "html.parser")
        links: Dict[str, Optional[str]] = {
            "docs": None,
            "roadmap": None,
            "github": None,
            "twitter": None,
            "discord": None,
            "telegram": None,
        }

        for a in soup.find_all("a", href=True):
            raw_href = str(a["href"]).strip()
            if not raw_href or raw_href.startswith(("#", "mailto:", "javascript:")):
                continue

            full_url = urljoin(base_url, raw_href)
            lower_url = full_url.lower()
            anchor_text = a.get_text(" ", strip=True).lower()

            if not links["github"] and "github.com/" in lower_url:
                # Ignore generic github links or issue links if possible
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

        return links

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

        async with httpx.AsyncClient() as client:
            main_html, err = await self.fetch_html(client, normalized)
            if err:
                result.warnings.append(err)

            if main_html:
                title, meta_desc, text = extract_clean_text_from_html(main_html)
                result.title = title
                result.meta_description = meta_desc
                result.main_text = text

                discovered = self._discover_links(main_html, normalized)
                if not result.docs_url:
                    result.docs_url = discovered["docs"]
                result.roadmap_url = discovered["roadmap"]
                result.github_url = discovered["github"]
                result.twitter_url = discovered["twitter"]
                result.discord_url = discovered["discord"]
                result.telegram_url = discovered["telegram"]

            # Scrape Docs / GitBook if discovered or provided
            if result.docs_url and result.docs_url != normalized:
                docs_html, docs_err = await self.fetch_html(client, result.docs_url)
                if docs_err:
                    result.warnings.append(docs_err)
                elif docs_html:
                    _, _, docs_text = extract_clean_text_from_html(docs_html, max_chars=12000)
                    result.docs_text = docs_text
                    docs_links = self._discover_links(docs_html, result.docs_url)
                    if not result.github_url and docs_links["github"]:
                        result.github_url = docs_links["github"]
                    if not result.roadmap_url and docs_links["roadmap"]:
                        result.roadmap_url = docs_links["roadmap"]
                    if not result.twitter_url and docs_links["twitter"]:
                        result.twitter_url = docs_links["twitter"]
                    if not result.discord_url and docs_links["discord"]:
                        result.discord_url = docs_links["discord"]

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
