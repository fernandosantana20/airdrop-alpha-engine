from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.services.onchain_data import OnChainMetrics
from app.services.scraper import ScrapedProjectData

TIER1_VCS = {
    "paradigm",
    "a16z",
    "andreessen horowitz",
    "polychain",
    "polychain capital",
    "dragonfly",
    "dragonfly capital",
    "multicoin",
    "multicoin capital",
    "binance labs",
    "yzi labs",
    "coinbase ventures",
    "sequoia",
    "sequoia capital",
    "founders fund",
    "pantera",
    "pantera capital",
    "framework",
    "framework ventures",
    "delphi digital",
    "delphi ventures",
    "electric capital",
    "variant",
    "variant fund",
    "jump crypto",
    "jump capital",
    "wintermute",
    "hack vc",
    "lightspeed",
    "haun ventures",
    "placeholder",
    "robot ventures",
    "ribbit capital",
    "galaxydigital",
    "galaxy digital",
    "okx ventures",
    "animoca brands",
    "spartan group",
    "maven 11",
    "1kx",
    "dba",
    "archetype",
    "nascent",
}


def _detect_tier1(investors: List[str]) -> List[str]:
    found: List[str] = []
    for inv in investors:
        low = inv.lower().strip()
        if any(vc in low for vc in TIER1_VCS):
            found.append(inv)
    return list(dict.fromkeys(found))


def _days_since_iso(iso_str: Optional[str]) -> Optional[int]:
    if not iso_str:
        return None
    try:
        cleaned = iso_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        delta = datetime.now(timezone.utc) - dt
        return max(0, delta.days)
    except Exception:
        return None


def _fmt_usd_short(v: Optional[float]) -> str:
    if v is None:
        return "N/A"
    if v >= 1_000_000_000:
        return f"${v / 1_000_000_000:.2f}B"
    if v >= 1_000_000:
        return f"${v / 1_000_000:.2f}M"
    if v >= 1_000:
        return f"${v / 1_000:.1f}K"
    return f"${v:.0f}"


def build_deep_metrics(
    scraped: ScrapedProjectData,
    onchain: OnChainMetrics,
    fundamental_score: int,
) -> Dict[str, Any]:
    combined_text = f"{scraped.main_text} {scraped.docs_text} {scraped.roadmap_text}".lower()

    tier1 = _detect_tier1(onchain.investors)
    gh_days = (
        _days_since_iso(scraped.github_metrics.last_push)
        if scraped.github_metrics and scraped.github_metrics.last_push
        else None
    )
    gh_langs = (
        scraped.github_metrics.top_languages if scraped.github_metrics else []
    )
    is_tokenless = not bool(onchain.token_symbol)

    # 1. Classify Cost Model (FREE vs CAPITAL vs HYBRID)
    has_testnet_or_free = (
        scraped.has_waitlist
        or any(k in combined_text for k in ("testnet", "faucet", "devnet", "waitlist", "quest", "galxe"))
    )
    has_mainnet_capital = bool(onchain.tvl_usd and onchain.tvl_usd > 100_000) or any(
        k in combined_text for k in ("deposit", "stake", "staking", "vault", "liquidity", "yield", "borrow", "lend", "perp")
    )

    if has_testnet_or_free and not has_mainnet_capital:
        cost_model = "FREE_TESTNET"
        cost_model_label = "Gratuito (Testnet / Waitlist)"
        estimated_min_capital_usd = "$0 (Apenas tempo / Testnet)"
    elif has_mainnet_capital and has_testnet_or_free:
        cost_model = "HYBRID"
        cost_model_label = "Híbrido (Free + Opcional Capital)"
        estimated_min_capital_usd = "$0 (Grátis) ou $100+ (TVL/Volume)"
    elif has_mainnet_capital:
        cost_model = "CAPITAL_REQUIRED"
        cost_model_label = "Exige Capital (Liquidez / Volume / Gas)"
        if (onchain.tvl_usd or 0) >= 500_000_000:
            estimated_min_capital_usd = "$500 - $2.000+ (alta diluição)"
        else:
            estimated_min_capital_usd = "$100 - $500 (capital + gas)"
    else:
        cost_model = "FREE_TESTNET"
        cost_model_label = "Gratuito / Estágio Inicial"
        estimated_min_capital_usd = "$0 - $20 (Gas/Testnet)"

    # 2. Saturation / Dilution Risk
    tvl = onchain.tvl_usd or 0.0
    if tvl >= 1_000_000_000:
        saturation_risk = "ALTA"
    elif tvl >= 150_000_000:
        saturation_risk = "MÉDIA"
    else:
        saturation_risk = "BAIXA"

    # 3. Profitability Rating (combines fundamentals, tokenless asymmetry, revenue, hacks)
    hacks_count = len(onchain.hacks_history)
    if (
        fundamental_score >= 70
        and is_tokenless
        and hacks_count == 0
        and (saturation_risk != "ALTA" or (onchain.fees_30d_usd or 0) >= 1_000_000)
    ):
        profitability_rating = "ALTA"
    elif fundamental_score >= 55 and hacks_count == 0:
        profitability_rating = "MÉDIA"
    else:
        profitability_rating = "BAIXA"

    # 4. Build 7-Point Provenance & Security Checklist
    checks: List[Dict[str, str]] = []

    # Check 1: Domain Age (RDAP)
    age = scraped.domain_age_days
    if age is None:
        checks.append(
            {
                "label": "Idade do Domínio (RDAP)",
                "status": "WARN",
                "detail": "Data de registro do domínio não retornada pelo RDAP público.",
            }
        )
    elif age >= 180:
        checks.append(
            {
                "label": "Idade do Domínio (RDAP)",
                "status": "PASS",
                "detail": f"Domínio registrado há {age} dias (desde {scraped.domain_created_at}) — procedência consolidada.",
            }
        )
    elif age >= 60:
        checks.append(
            {
                "label": "Idade do Domínio (RDAP)",
                "status": "WARN",
                "detail": f"Domínio recente ({age} dias, desde {scraped.domain_created_at}) — redobre cautela com capital.",
            }
        )
    else:
        checks.append(
            {
                "label": "Idade do Domínio (RDAP)",
                "status": "FAIL",
                "detail": f"Domínio recém-criado ({age} dias, desde {scraped.domain_created_at}) — alto risco de projeto efêmero/rug.",
            }
        )

    # Check 2: Hacks History
    if hacks_count == 0:
        checks.append(
            {
                "label": "Histórico de Hacks / Exploits",
                "status": "PASS",
                "detail": "Nenhum exploit/hack registrado na base pública do DefiLlama Hacks.",
            }
        )
    else:
        total_hacked = sum(float(h.get("amount_usd") or 0) for h in onchain.hacks_history)
        checks.append(
            {
                "label": "Histórico de Hacks / Exploits",
                "status": "FAIL",
                "detail": f"{hacks_count} incidente(s) histórico(s) registrado(s) totalizando {_fmt_usd_short(total_hacked)}.",
            }
        )

    # Check 3: Smart Contract Audits
    audits_n = max(onchain.audits_count, len(onchain.audit_links))
    if audits_n > 0:
        checks.append(
            {
                "label": "Auditorias de Segurança",
                "status": "PASS",
                "detail": f"{audits_n} auditoria(s) verificada(s) e vinculada(s) ao protocolo.",
            }
        )
    elif any(k in combined_text for k in ("audit", "audits", "trail of bits", "openzeppelin", "spearbit", "certik", "immunefi")):
        checks.append(
            {
                "label": "Auditorias de Segurança",
                "status": "WARN",
                "detail": "Auditoria mencionada no site/docs, mas não indexada formalmente no DefiLlama.",
            }
        )
    else:
        checks.append(
            {
                "label": "Auditorias de Segurança",
                "status": "FAIL",
                "detail": "Nenhuma auditoria de smart contracts encontrada — evite depositar capital relevante.",
            }
        )

    # Check 4: Tier-1 Backing
    if tier1:
        checks.append(
            {
                "label": "Investidores & Backing",
                "status": "PASS",
                "detail": f"Backers Tier-1 confirmados: {', '.join(tier1[:5])}.",
            }
        )
    elif onchain.investors or onchain.total_funding_usd:
        checks.append(
            {
                "label": "Investidores & Backing",
                "status": "WARN",
                "detail": f"Funding/investidores encontrados ({', '.join(onchain.investors[:4]) or _fmt_usd_short(onchain.total_funding_usd)}), sem fundo Tier-1 listado.",
            }
        )
    else:
        checks.append(
            {
                "label": "Investidores & Backing",
                "status": "WARN",
                "detail": "Sem rodadas de VC indexadas (pode ser bootstrapped ou muito inicial).",
            }
        )

    # Check 5: Real Revenue / Fees
    if onchain.fees_30d_usd and onchain.fees_30d_usd >= 100_000:
        checks.append(
            {
                "label": "Receita & Taxas Reais (30d)",
                "status": "PASS",
                "detail": f"Geração real de taxas: {_fmt_usd_short(onchain.fees_30d_usd)} nos últimos 30 dias ({_fmt_usd_short(onchain.fees_24h_usd)}/24h).",
            }
        )
    elif onchain.fees_30d_usd and onchain.fees_30d_usd > 0:
        checks.append(
            {
                "label": "Receita & Taxas Reais (30d)",
                "status": "WARN",
                "detail": f"Taxas ainda modestas: {_fmt_usd_short(onchain.fees_30d_usd)} nos últimos 30 dias.",
            }
        )
    else:
        checks.append(
            {
                "label": "Receita & Taxas Reais (30d)",
                "status": "WARN",
                "detail": "Sem receita de taxas indexada no DefiLlama Fees (normal para testnets/pré-lançamento).",
            }
        )

    # Check 6: GitHub Engineering Velocity
    if scraped.github_metrics and gh_days is not None:
        if gh_days <= 45:
            checks.append(
                {
                    "label": "Atividade de Engenharia (GitHub)",
                    "status": "PASS",
                    "detail": f"Código ativo (último commit há {gh_days} dia(s) · {scraped.github_metrics.stars or 0}★ · {', '.join(gh_langs[:3]) or 'N/A'}).",
                }
            )
        elif gh_days <= 180:
            checks.append(
                {
                    "label": "Atividade de Engenharia (GitHub)",
                    "status": "WARN",
                    "detail": f"Último commit público há {gh_days} dias — atividade moderada ou desenvolvimento privado.",
                }
            )
        else:
            checks.append(
                {
                    "label": "Atividade de Engenharia (GitHub)",
                    "status": "FAIL",
                    "detail": f"Repositório sem commits públicos há {gh_days} dias — sinal de alerta de estagnação.",
                }
            )
    elif scraped.github_url or onchain.defillama_github:
        checks.append(
            {
                "label": "Atividade de Engenharia (GitHub)",
                "status": "WARN",
                "detail": "GitHub vinculado, mas métricas de commit não retornadas (rate limit ou org privada).",
            }
        )
    else:
        checks.append(
            {
                "label": "Atividade de Engenharia (GitHub)",
                "status": "FAIL",
                "detail": "Nenhum repositório GitHub público encontrado.",
            }
        )

    # Check 7: Tokenless & Asymmetry
    if is_tokenless:
        checks.append(
            {
                "label": "Status Tokenless & Assimetria",
                "status": "PASS",
                "detail": f"Sem token listado — alta assimetria pré-TGE (diluição estimada: {saturation_risk}).",
            }
        )
    else:
        checks.append(
            {
                "label": "Status Tokenless & Assimetria",
                "status": "WARN",
                "detail": f"Token {onchain.token_symbol} já existe (MCap: {_fmt_usd_short(onchain.mcap_usd)}) — foco apenas em novas seasons/incentivos.",
            }
        )

    # 5. Asymmetry & Profitability Summary
    if profitability_rating == "ALTA":
        asymmetry_summary = (
            f"Alta relação risco-retorno ({cost_model_label}): protocolo sem token listado, "
            f"fundamentos sólidos ({fundamental_score}/100), histórico limpo de hacks e diluição {saturation_risk.lower()}."
        )
    elif profitability_rating == "MÉDIA":
        asymmetry_summary = (
            f"Potencial moderado ({cost_model_label}): acompanhe evolução de TVL/receita ou participe com custo baixo/grátis "
            f"antes de comprometer capital relevante."
        )
    else:
        asymmetry_summary = (
            f"Baixa atratividade atual para alocação de capital ({cost_model_label}): "
            f"{'histórico de hack/exploit registrado ou ' if hacks_count > 0 else ''}fundamentos insuficientes ou assimetria reduzida."
        )

    return {
        "cost_model": cost_model,
        "cost_model_label": cost_model_label,
        "estimated_min_capital_usd": estimated_min_capital_usd,
        "profitability_rating": profitability_rating,
        "saturation_risk": saturation_risk,
        "asymmetry_summary": asymmetry_summary,
        "fees_24h_usd": onchain.fees_24h_usd,
        "fees_30d_usd": onchain.fees_30d_usd,
        "fees_all_time_usd": onchain.fees_all_time_usd,
        "mcap_usd": onchain.mcap_usd,
        "token_symbol": onchain.token_symbol,
        "is_tokenless": is_tokenless,
        "domain_created_at": scraped.domain_created_at,
        "domain_age_days": scraped.domain_age_days,
        "audits_count": audits_n,
        "audit_links": onchain.audit_links,
        "hacks_count": hacks_count,
        "hacks_history": onchain.hacks_history,
        "tier1_investors": tier1,
        "github_days_since_push": gh_days,
        "github_languages": gh_langs,
        "provenance_checks": checks,
    }
