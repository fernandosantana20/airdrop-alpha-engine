from __future__ import annotations

import asyncio
import json
import logging
from typing import List, Tuple

from app.config import get_settings
from app.schemas import DueDiligenceReport, RoadmapMilestone, ScoreBreakdown, StrategicTaskSchema
from app.services.onchain_data import OnChainMetrics
from app.services.scraper import ScrapedProjectData

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """
Você é um Analista Sênior de Research & Due Diligence Web3 de um fundo cripto institucional,
especializado em filtrar projetos reais de alto potencial de airdrop e descartar vaporware, forks vazios e rug pulls.

SUA MISSÃO:
Analise rigorosamente os dados coletados (website, documentação/GitBook, GitHub e métricas DefiLlama)
e produza um relatório estruturado de Due Diligence em JSON seguindo exatamente o schema solicitado.

CRITÉRIOS DE PONTUAÇÃO (Total 0 a 100):
1. product_utility (0-20): O produto resolve um problema real? Existe diferencial técnico claro (L2, Restaking, ZK, Modular, Perp DEX, AI Infra, etc.) ou é apenas buzzword/fork genérico?
2. backing_funding (0-20): Investidores Tier-1 (a16z, Paradigm, Polychain, Binance Labs, Coinbase Ventures, Multicoin, etc.), rodadas verificáveis ou grants relevantes. Sem funding público = nota baixa, salvo bootstrapping comprovado por TVL/receita real.
3. tvl_traction (0-20): TVL no DefiLlama, crescimento 7d, adoção multi-chain, ou forte tração verificável em testnet/ecossistema.
4. github_activity (0-15): Repositórios públicos reais, commits recentes, estrelas orgânicas e engenharia ativa. Ausência total de GitHub em protocolo DeFi/Infra é sinal de alerta.
5. airdrop_potential (0-15): Projeto ainda sem token (tokenless) ou com alocação comunitária/pontos/XP/testnet incentivada? Se já possui token consolidado sem novos incentivos, reduza esta nota.
6. security_rug_resistance (0-10): Auditorias mencionadas, documentação técnica séria, transparência, canais oficiais consistentes e ausência de promessas irreais (APY absurdo, hype vazio).

REGRAS DE VEREDITO:
- fundamental_score DEVE ser exatamente a soma dos 6 critérios acima (0 a 100).
- Score >= 70 -> verdict = "APPROVED"
- Score 50 a 69 -> verdict = "WATCHLIST"
- Score < 50 -> verdict = "REJECTED"

REGRAS DO ROADMAP (roadmap_milestones):
- Gere de 5 a 7 marcos reais e cronológicos ESPECÍFICOS deste protocolo (combinando o que já foi concluído com base nos dados reais, a fase atual em andamento e os próximos marcos reais encontrados nos docs/site/roadmap).
- NUNCA use frases genéricas quando a documentação mencionar produtos, tokens, vaults, seasons, testnets ou upgrades concretos (ex: cite o nome real dos vaults, tokens sintéticos, bridges ou fases do protocolo).

REGRAS DO PLANO ANTI-SYBIL (strategic_tasks):
- SE fundamental_score >= 70: gere de 5 a 7 tarefas práticas, ESPECÍFICAS para os produtos/contratos reais deste protocolo (cite nomes reais de tokens, pools, vaults, bridges ou programas de pontos/referral encontrados no site/docs), focadas em maximizar elegibilidade e evitar filtros Sybil (ex: manter saldo mínimo orgânico na mainnet, variar valores e dias da semana, usar bridge nativa, fornecer liquidez por > 14 dias, votar em governança, evitar transações repetitivas/dust no mesmo bloco).
- SE fundamental_score < 70: retorne strategic_tasks como lista vazia [] (não desperdice capital/tempo do usuário em projetos reprovados ou em observação).

IDIOMA:
Escreva executive_summary, bull_case, red_flags, roadmap_summary, anti_sybil_strategy e descrições das tarefas em Português do Brasil (PT-BR), com tom direto, técnico e sem enrolação.
""".strip()


class AIDueDiligenceAnalyzer:
    def __init__(self) -> None:
        self.settings = get_settings()

    def _build_context_payload(
        self, scraped: ScrapedProjectData, onchain: OnChainMetrics
    ) -> str:
        gh_block = "Not found"
        if scraped.github_metrics:
            gh_block = (
                f"URL: {scraped.github_metrics.url}\n"
                f"Stars: {scraped.github_metrics.stars}\n"
                f"Repos: {scraped.github_metrics.repos_count}\n"
                f"Last Push: {scraped.github_metrics.last_push}\n"
                f"Languages: {', '.join(scraped.github_metrics.top_languages)}\n"
                f"Summary: {scraped.github_metrics.summary}"
            )

        rounds_text = "None found"
        if onchain.funding_rounds:
            rounds_text = "\n".join(
                f"- {r.round_name}: ${r.amount_usd_millions or 0:.2f}M | Leads: {', '.join(r.lead_investors) or 'N/A'} | Others: {', '.join(r.other_investors[:5]) or 'N/A'}"
                for r in onchain.funding_rounds
            )

        return f"""
=== PROJECT INPUT ===
URL: {scraped.url}
Domain: {scraped.domain}
Inferred Name: {scraped.inferred_name}
HTML Title: {scraped.title}
Meta Description: {scraped.meta_description}

=== DISCOVERED LINKS ===
Docs URL: {scraped.docs_url or 'Not found'}
Roadmap URL: {scraped.roadmap_url or 'Not found'}
GitHub URL: {scraped.github_url or onchain.defillama_github or 'Not found'}
Twitter/X: {scraped.twitter_url or onchain.defillama_twitter or 'Not found'}
Discord: {scraped.discord_url or 'Not found'}
Telegram: {scraped.telegram_url or 'Not found'}

=== DEFILLAMA ON-CHAIN & FUNDING METRICS ===
Matched Protocol: {onchain.matched_protocol or 'None'}
Category: {onchain.category or 'Unknown'}
Protocol Description: {onchain.description or 'N/A'}
Chains: {', '.join(onchain.chains) if onchain.chains else 'None indexed'}
TVL (USD): {f"${onchain.tvl_usd:,.2f}" if onchain.tvl_usd is not None else 'N/A'}
TVL 7d Change (%): {f"{onchain.tvl_change_7d:.2f}%" if onchain.tvl_change_7d is not None else 'N/A'}
Fees 24h / 30d (USD): {f"${onchain.fees_24h_usd:,.0f}" if onchain.fees_24h_usd else 'N/A'} / {f"${onchain.fees_30d_usd:,.0f}" if onchain.fees_30d_usd else 'N/A'}
Existing Token Symbol: {onchain.token_symbol or 'None detected (potentially tokenless)'}
Verified Audits: {onchain.audits_count} ({', '.join(onchain.audit_links[:3]) if onchain.audit_links else 'No audit links indexed'})
Historical Hacks / Exploits: {len(onchain.hacks_history)} ({'; '.join(f"{h.get('date')} ${h.get('amount_usd') or 0:,.0f} ({h.get('technique')})" for h in onchain.hacks_history[:3]) if onchain.hacks_history else 'None recorded'})
Domain Age (RDAP): {f"{scraped.domain_age_days} days (registered {scraped.domain_created_at})" if scraped.domain_age_days is not None else 'Unknown'}
Community Engagement: Discord={scraped.discord_members or 'N/A'} members ({scraped.discord_online or 'N/A'} online) | Telegram={scraped.telegram_members or 'N/A'} members
Waitlist / Referral: waitlist={scraped.has_waitlist} ({scraped.waitlist_url or 'N/A'}) | referral={scraped.has_referral} ({scraped.referral_url or 'N/A'})
Token Supply / FDV: total_supply={onchain.total_supply or 'N/A'} | circulating={onchain.circulating_supply or 'N/A'} | fdv={f"${onchain.fdv_usd:,.0f}" if onchain.fdv_usd else 'N/A'}
Total Funding (USD): {f"${onchain.total_funding_usd:,.2f}" if onchain.total_funding_usd is not None else 'N/A'}
Investors: {', '.join(onchain.investors[:15]) if onchain.investors else 'None indexed'}
Funding Rounds:
{rounds_text}
Notes: {' | '.join(onchain.source_notes)}

=== GITHUB ACTIVITY ===
{gh_block}

=== WEBSITE CONTENT EXCERPT ===
{scraped.main_text[:6000] or '[Website content could not be extracted — possibly JS-rendered SPA or blocked]'}

=== DOCUMENTATION / GITBOOK EXCERPT ===
{scraped.docs_text[:5000] or '[No separate docs page scraped]'}

=== ROADMAP EXCERPT ===
{scraped.roadmap_text[:3000] or '[No dedicated roadmap page scraped]'}

=== SCRAPER WARNINGS ===
{', '.join(scraped.warnings) if scraped.warnings else 'None'}
""".strip()

    def _normalize_report(self, report: DueDiligenceReport) -> DueDiligenceReport:
        b = report.score_breakdown
        total = (
            b.product_utility
            + b.backing_funding
            + b.tvl_traction
            + b.github_activity
            + b.airdrop_potential
            + b.security_rug_resistance
        )
        total = max(0, min(100, total))
        report.fundamental_score = total
        if total >= 70:
            report.verdict = "APPROVED"
        elif total >= 50:
            report.verdict = "WATCHLIST"
            report.strategic_tasks = []
        else:
            report.verdict = "REJECTED"
            report.strategic_tasks = []
        return report

    def _discover_available_models(self, client) -> List[str]:
        """Dynamically list models enabled for this API key that support generateContent."""
        found: List[str] = []
        try:
            for m in client.models.list():
                name = getattr(m, "name", "") or ""
                short = name.replace("models/", "")
                actions = getattr(m, "supported_actions", None) or []
                if "gemini" not in short.lower():
                    continue
                if any(bad in short.lower() for bad in ("embedding", "imagen", "veo", "tts", "audio", "robotics", "computer-use")):
                    continue
                if actions and "generateContent" not in actions:
                    continue
                found.append(short)
        except Exception as exc:
            logger.warning("Could not list Gemini models: %s", exc)

        # Prefer models with highest free-tier availability first (flash-lite / flash)
        def _rank(name: str) -> tuple[int, str]:
            low = name.lower()
            if "flash-lite" in low:
                return (0, name)
            if "3-flash" in low or "3.0-flash" in low:
                return (1, name)
            if "2.5-flash" in low:
                return (2, name)
            if "flash" in low:
                return (3, name)
            if "pro" in low:
                return (4, name)
            return (5, name)

        found.sort(key=lambda n: (_rank(n)[0], n))
        return found

    def _run_gemini_sync(self, prompt_context: str) -> DueDiligenceReport:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=self.settings.gemini_api_key)
        discovered = self._discover_available_models(client)
        candidate_models = list(
            dict.fromkeys(
                discovered[:6]
                + [
                    self.settings.gemini_model,
                    "gemini-3-flash-preview",
                    "gemini-2.5-flash",
                ]
            )
        )
        logger.info("Gemini candidate models: %s", candidate_models)

        last_exc: Exception | None = None
        response = None
        for model_name in candidate_models:
            try:
                response = client.models.generate_content(
                    model=model_name,
                    contents=prompt_context,
                    config=types.GenerateContentConfig(
                        system_instruction=SYSTEM_PROMPT,
                        response_mime_type="application/json",
                        response_schema=DueDiligenceReport,
                        temperature=0.2,
                    ),
                )
                logger.info("Gemini analysis succeeded with model: %s", model_name)
                break
            except Exception as exc:
                last_exc = exc
                err_str = str(exc)
                if any(
                    tok in err_str
                    for tok in ("404", "NOT_FOUND", "no longer available", "429", "RESOURCE_EXHAUSTED")
                ):
                    logger.warning("Gemini model %s unavailable/exhausted, trying next...", model_name)
                    continue
                raise

        if response is None:
            raise last_exc or RuntimeError(
                f"No available Gemini model succeeded (tried: {', '.join(candidate_models[:5])})."
            )

        if getattr(response, "parsed", None) is not None:
            parsed = response.parsed
            if isinstance(parsed, DueDiligenceReport):
                return self._normalize_report(parsed)
            return self._normalize_report(DueDiligenceReport.model_validate(parsed))

        raw_text = response.text or "{}"
        data = json.loads(raw_text)
        return self._normalize_report(DueDiligenceReport.model_validate(data))

    def _heuristic_fallback(
        self, scraped: ScrapedProjectData, onchain: OnChainMetrics
    ) -> DueDiligenceReport:
        """Deterministic scoring fallback when GEMINI_API_KEY is not configured yet."""
        name = onchain.matched_protocol or scraped.inferred_name
        category = onchain.category or "Web3 Protocol"

        # 1. Product utility (0-20)
        utility = 8
        if scraped.docs_url or scraped.docs_text:
            utility += 5
        if len(scraped.main_text) > 800:
            utility += 3
        if onchain.matched_protocol:
            utility += 4
        utility = min(20, utility)

        # 2. Backing & funding (0-20)
        funding = 4
        if onchain.total_funding_usd:
            if onchain.total_funding_usd >= 50_000_000:
                funding = 20
            elif onchain.total_funding_usd >= 15_000_000:
                funding = 16
            elif onchain.total_funding_usd >= 5_000_000:
                funding = 12
            else:
                funding = 9
        elif len(onchain.investors) >= 3:
            funding = 15
        elif len(onchain.investors) >= 1 or len(onchain.funding_rounds) >= 1:
            funding = 12

        # 3. TVL & traction (0-20)
        tvl_score = 4
        if onchain.tvl_usd:
            if onchain.tvl_usd >= 500_000_000:
                tvl_score = 20
            elif onchain.tvl_usd >= 100_000_000:
                tvl_score = 17
            elif onchain.tvl_usd >= 10_000_000:
                tvl_score = 13
            elif onchain.tvl_usd >= 1_000_000:
                tvl_score = 9
            else:
                tvl_score = 6

        # 4. GitHub activity (0-15)
        gh_score = 2
        if scraped.github_metrics:
            gh_score = 7
            if (scraped.github_metrics.stars or 0) >= 500:
                gh_score = 14
            elif (scraped.github_metrics.stars or 0) >= 100:
                gh_score = 11
            elif (scraped.github_metrics.repos_count or 0) >= 5:
                gh_score = 10
        elif onchain.defillama_github:
            gh_score = 9

        # 5. Airdrop potential (0-15)
        combined_text = f"{scraped.main_text} {scraped.docs_text}".lower()
        airdrop = 12 if not onchain.token_symbol else 5
        if any(k in combined_text for k in ("points", "xp", "testnet", "season", "rewards", "airdrop")):
            airdrop = min(15, airdrop + 3)

        # 6. Security & rug resistance (0-10)
        security = 4
        if onchain.audits_count > 0 or onchain.audit_links or any(
            k in combined_text
            for k in ("audit", "audits", "certik", "trail of bits", "openzeppelin", "spearbit", "bug bounty", "immunefi")
        ):
            security += 3
        if scraped.docs_url or onchain.audit_links:
            security += 2
        if scraped.twitter_url and (scraped.discord_url or scraped.telegram_url):
            security += 1
        if scraped.domain_age_days is not None and scraped.domain_age_days < 45:
            security = max(1, security - 3)
        if len(onchain.hacks_history) > 0:
            security = max(1, security - 4)
        security = min(10, security)

        # Bonus on TVL/traction when real 30d fee revenue is proven
        if onchain.fees_30d_usd and onchain.fees_30d_usd >= 500_000:
            tvl_score = min(20, tvl_score + 3)
        elif onchain.fees_30d_usd and onchain.fees_30d_usd >= 50_000:
            tvl_score = min(20, tvl_score + 2)

        breakdown = ScoreBreakdown(
            product_utility=utility,
            backing_funding=funding,
            tvl_traction=tvl_score,
            github_activity=gh_score,
            airdrop_potential=airdrop,
            security_rug_resistance=security,
        )
        total = (
            utility + funding + tvl_score + gh_score + airdrop + security
        )

        bull_case: List[str] = []
        red_flags: List[str] = [
            "Análise executada em modo heurístico local (configure GEMINI_API_KEY no .env para auditoria profunda via Gemini 2.5)."
        ]

        if onchain.tvl_usd:
            bull_case.append(f"TVL indexado no DefiLlama: ${onchain.tvl_usd:,.0f}.")
        else:
            red_flags.append("Sem TVL indexado no DefiLlama até o momento.")

        if onchain.total_funding_usd:
            bull_case.append(
                f"Funding público de ${onchain.total_funding_usd / 1_000_000:.2f}M com {len(onchain.investors)} investidor(es) listados."
            )
        elif onchain.investors or onchain.funding_rounds:
            bull_case.append(
                f"Rodada(s) de funding confirmadas no DefiLlama (backers: {', '.join(onchain.investors[:5]) or 'não divulgado'})."
            )
        else:
            red_flags.append("Nenhuma rodada de funding encontrada na base pública do DefiLlama.")

        if onchain.audits_count > 0 or onchain.audit_links:
            bull_case.append(
                f"{max(onchain.audits_count, len(onchain.audit_links))} auditoria(s) de segurança indexada(s) no DefiLlama."
            )

        if scraped.github_url or onchain.defillama_github:
            bull_case.append("Presença verificável no GitHub com código aberto.")
        else:
            red_flags.append("Repositório GitHub não localizado automaticamente no site.")

        if not onchain.token_symbol:
            bull_case.append("Protocolo aparentemente sem token listado (alto potencial de TGE/airdrop).")
        else:
            red_flags.append(f"Token já existente detectado ({onchain.token_symbol}), podendo limitar novo airdrop.")

        tasks: List[StrategicTaskSchema] = []
        if total >= 70:
            tasks = [
                StrategicTaskSchema(
                    title="Onboarding orgânico e bridge via rota oficial",
                    description=f"Conecte uma carteira com histórico prévio na Ethereum/L2s e realize um depósito inicial no protocolo {name} usando a bridge oficial.",
                    category="Bridge",
                    priority="HIGH",
                    frequency="ONCE",
                    estimated_cost_usd="$2 - $8",
                    anti_sybil_tip="Evite financiar a carteira a partir de outra carteira pessoal; saque diretamente de uma CEX e mantenha saldo residual em ETH.",
                    action_url=scraped.url,
                ),
                StrategicTaskSchema(
                    title="Interações recorrentes em semanas distintas",
                    description=f"Execute swaps, depósitos ou interações principais no {name} variando os valores (ex: $55, $132, $87) em dias aleatórios da semana.",
                    category="On-Chain",
                    priority="HIGH",
                    frequency="WEEKLY",
                    estimated_cost_usd="$1 - $4",
                    anti_sybil_tip="Nunca repita valores redondos exatos nem faça 10 transações no mesmo dia para inflar contagem.",
                    action_url=scraped.url,
                ),
                StrategicTaskSchema(
                    title="Prover liquidez ou staking por período contínuo (> 14 dias)",
                    description=f"Aloque uma parcela estratégica em pools ou vaults do {name} e mantenha a posição aberta por pelo menos 2 a 4 semanas.",
                    category="Liquidity",
                    priority="MEDIUM",
                    frequency="MONTHLY",
                    estimated_cost_usd="$2 - $5 (gas) + capital",
                    anti_sybil_tip="Protocolos modernos penalizam liquidez mercenária que entra e sai em menos de 48 horas.",
                    action_url=scraped.url,
                ),
                StrategicTaskSchema(
                    title="Monitorar governança, roles no Discord e campanhas de pontos",
                    description="Verifique cargos verificados (Guild/Galxe/Discord), participe de votações no Snapshot e acompanhe atualizações de testnet/mainnet.",
                    category="Governance",
                    priority="MEDIUM",
                    frequency="BIWEEKLY",
                    estimated_cost_usd="Free",
                    anti_sybil_tip="Vincule apenas contas sociais legítimas e com atividade real; evite farms automatizados.",
                    action_url=scraped.docs_url or scraped.url,
                ),
                StrategicTaskSchema(
                    title="Higiene de carteira e diversificação de contratos",
                    description=f"Interaja com pelo menos 3 a 5 contratos inteligentes distintos dentro do ecossistema {name} ao longo de 2+ meses.",
                    category="Anti-Sybil",
                    priority="HIGH",
                    frequency="MONTHLY",
                    estimated_cost_usd="$1 - $3",
                    anti_sybil_tip="Consistência mensal (active months) tem peso muito maior que volume pontual em um único dia.",
                    action_url=scraped.docs_url or scraped.url,
                ),
            ]

        # Build a complete, chronological, end-to-end project roadmap map
        # (Past / DONE -> Current / IN_PROGRESS -> Future / UPCOMING) + any specific doc milestones
        milestones: List[RoadmapMilestone] = []

        # 1. DONE: Foundation & Provenance
        domain_detail = (
            f"Domínio oficial registrado em {scraped.domain_created_at} ({scraped.domain_age_days} dias de histórico)."
            if scraped.domain_created_at
            else f"Site oficial ({scraped.domain}) e canais de comunidade publicados."
        )
        channels_active = [
            lbl
            for lbl, val in (
                ("Docs", scraped.docs_url),
                ("GitHub", scraped.github_url or onchain.defillama_github),
                ("X", scraped.twitter_url or onchain.defillama_twitter),
                ("Discord", scraped.discord_url),
                ("Telegram", scraped.telegram_url),
            )
            if val
        ]
        milestones.append(
            RoadmapMilestone(
                phase="Etapa 1 · Fundação",
                title="Estruturação, Site & Documentação Pública",
                status="DONE",
                details=f"{domain_detail} Canais ativos: {', '.join(channels_active) or 'Site oficial'}.",
            )
        )

        # 2. DONE (or UPCOMING): Backing & Venture Capital
        if onchain.funding_rounds or onchain.investors or onchain.total_funding_usd:
            funding_str = (
                f"${onchain.total_funding_usd / 1_000_000:.2f}M captados"
                if onchain.total_funding_usd
                else "Rodada registrada no DefiLlama"
            )
            inv_str = ", ".join(onchain.investors[:5]) if onchain.investors else "investidores não divulgados"
            milestones.append(
                RoadmapMilestone(
                    phase="Etapa 2 · Backing",
                    title="Captação & Investidores Institucionais",
                    status="DONE",
                    details=f"{funding_str}. Backers confirmados: {inv_str}.",
                )
            )
        else:
            milestones.append(
                RoadmapMilestone(
                    phase="Etapa 2 · Backing",
                    title="Captação / Grants / Bootstrapping",
                    status="IN_PROGRESS",
                    details="Nenhuma rodada pública de VC indexada ainda (projeto bootstrapped ou rodada ainda não divulgada).",
                )
            )

        # 3. DONE / IN_PROGRESS: Engineering & Smart Contract Audits
        audits_n = max(onchain.audits_count, len(onchain.audit_links))
        gh_note = (
            f"GitHub ativo ({scraped.github_metrics.stars or 0}★, {scraped.github_metrics.repos_count or 1} repo(s))"
            if scraped.github_metrics
            else ("GitHub vinculado" if (scraped.github_url or onchain.defillama_github) else "Código-fonte fechado/privado")
        )
        milestones.append(
            RoadmapMilestone(
                phase="Etapa 3 · Engenharia & Segurança",
                title="Desenvolvimento On-Chain & Auditorias",
                status="DONE" if audits_n > 0 else "IN_PROGRESS",
                details=(
                    f"{gh_note}. {audits_n} auditoria(s) de smart contracts verificada(s) no DefiLlama."
                    if audits_n > 0
                    else f"{gh_note}. Aguardando publicação formal de auditorias de segurança."
                ),
            )
        )

        # 4. CURRENT (IN_PROGRESS): Product Live (Mainnet TVL vs Testnet/Early Access)
        if onchain.tvl_usd and onchain.tvl_usd > 0:
            chains_str = ", ".join(onchain.chains[:4]) or "rede principal"
            fees_str = (
                f" Receita 30d: ${onchain.fees_30d_usd:,.0f}."
                if onchain.fees_30d_usd
                else ""
            )
            milestones.append(
                RoadmapMilestone(
                    phase="Etapa 4 · Operação Atual",
                    title="Mainnet Ativa & Tração de Liquidez (TVL)",
                    status="IN_PROGRESS",
                    details=f"Protocolo em produção com ${onchain.tvl_usd:,.0f} de TVL em {chains_str}.{fees_str}",
                )
            )
        else:
            milestones.append(
                RoadmapMilestone(
                    phase="Etapa 4 · Operação Atual",
                    title="Testnet / Beta Fechado & Validação Inicial",
                    status="IN_PROGRESS",
                    details="Protocolo em estágio pré-TVL/testnet — foco em testes gratuitos, faucets e feedback inicial.",
                )
            )

        # 5. CURRENT (IN_PROGRESS): Community, Points, Waitlist & Referral Growth
        growth_bits: List[str] = []
        if scraped.has_waitlist:
            growth_bits.append("Waitlist / Early Access ativa")
        if scraped.has_referral:
            growth_bits.append("Programa de Referral/Pontos ativo")
        if scraped.discord_members:
            growth_bits.append(f"Discord com {scraped.discord_members:,} membros")
        if scraped.telegram_members:
            growth_bits.append(f"Telegram com {scraped.telegram_members:,} membros")
        milestones.append(
            RoadmapMilestone(
                phase="Etapa 5 · Crescimento & Incentivos",
                title="Campanha de Pontos, Referral & Comunidade",
                status="IN_PROGRESS",
                details=(
                    " · ".join(growth_bits) + "."
                    if growth_bits
                    else "Fase de construção de comunidade, campanhas sociais e aquisição orgânica de usuários."
                ),
            )
        )

        # Append up to 2 concrete version/quarter milestones extracted directly from official docs
        added_doc_titles: set[str] = set()
        for m in scraped.extracted_milestones:
            clean_t = m.get("title", "").strip()
            if len(clean_t) < 10 or clean_t.lower() in added_doc_titles:
                continue
            added_doc_titles.add(clean_t.lower())
            milestones.append(
                RoadmapMilestone(
                    phase=f"Docs · {m['phase']}",
                    title=clean_t,
                    status=m["status"] if m["status"] in {"DONE", "IN_PROGRESS", "UPCOMING"} else "UPCOMING",
                    details=m.get("details", ""),
                )
            )
            if len(added_doc_titles) >= 2:
                break

        # 6. UPCOMING: Snapshot & Anti-Sybil Qualification Window
        milestones.append(
            RoadmapMilestone(
                phase="Etapa 6 · Qualificação",
                title="Snapshot On-Chain & Filtro Anti-Sybil",
                status="UPCOMING" if not onchain.token_symbol else "IN_PROGRESS",
                details=(
                    "Janela crítica para acumular meses ativos, volume orgânico, liquidez contínua (>14 dias) e evitar padrões de bot antes do snapshot."
                    if not onchain.token_symbol
                    else "Acompanhar snapshots de novas Seasons/incentivos recorrentes para usuários ativos."
                ),
            )
        )

        # 7. UPCOMING (or DONE if token live): TGE, Airdrop Claim & Governance
        if not onchain.token_symbol:
            milestones.append(
                RoadmapMilestone(
                    phase="Etapa 7 · TGE & Airdrop",
                    title="Lançamento do Token (TGE), Claim & Listagens",
                    status="UPCOMING",
                    details="Token ainda não listado — monitoramento automático de docs/roadmap ativo para alertar anúncio de TGE, checker de elegibilidade e claim no Telegram.",
                )
            )
        else:
            milestones.append(
                RoadmapMilestone(
                    phase="Etapa 7 · Pós-TGE",
                    title=f"Token {onchain.token_symbol} Ativo, Governança & Expansão",
                    status="DONE",
                    details=f"Token {onchain.token_symbol} já lançado no mercado. Foco em governança, staking e eventuais temporadas futuras (Season 2+).",
                )
            )

        report = DueDiligenceReport(
            project_name=name,
            category=category,
            fundamental_score=total,
            verdict="APPROVED" if total >= 70 else ("WATCHLIST" if total >= 50 else "REJECTED"),
            score_breakdown=breakdown,
            executive_summary=(
                f"{name} obteve score fundamental de {total}/100 na triagem automatizada "
                f"(TVL: {f'${onchain.tvl_usd:,.0f}' if onchain.tvl_usd else 'N/A'}, "
                f"Funding: {f'${onchain.total_funding_usd / 1_000_000:.1f}M' if onchain.total_funding_usd else 'N/A'}). "
                f"{'Aprovado para estratégia Anti-Sybil.' if total >= 70 else 'Abaixo do corte mínimo de 70 pontos para alocação de capital/tempo.'}"
            ),
            bull_case=bull_case or ["Projeto em estágio inicial com documentação acessível."],
            red_flags=red_flags,
            roadmap_summary=(
                "Documentação/site monitorado para detecção automática de mudanças de roadmap, testnet e TGE."
                if scraped.monitored_url
                else "Nenhuma página de roadmap dedicada identificada automaticamente."
            ),
            roadmap_milestones=milestones,
            anti_sybil_strategy=(
                "Priorize consistência temporal (3+ meses ativos), valores não-redondos, uso de bridge oficial e retenção de liquidez acima de 14 dias."
                if total >= 70
                else "Não recomendado para farming ativo até que fundamentos e tração atinjam score >= 70."
            ),
            strategic_tasks=tasks,
        )
        return self._normalize_report(report)

    async def analyze(
        self, scraped: ScrapedProjectData, onchain: OnChainMetrics
    ) -> Tuple[DueDiligenceReport, str]:
        """Returns (DueDiligenceReport, analysis_mode: 'gemini' | 'heuristic')."""
        if not self.settings.has_gemini_key:
            logger.info("GEMINI_API_KEY not configured — running heuristic due diligence fallback.")
            return self._heuristic_fallback(scraped, onchain), "heuristic"

        context = self._build_context_payload(scraped, onchain)
        try:
            report = await asyncio.to_thread(self._run_gemini_sync, context)
            return report, "gemini"
        except Exception as exc:
            logger.exception("Gemini analysis failed, falling back to heuristic mode: %s", exc)
            fallback = self._heuristic_fallback(scraped, onchain)
            fallback.red_flags.insert(
                0, f"Aviso: fallback heurístico ativado após erro na API Gemini ({str(exc)[:140]})."
            )
            return fallback, "heuristic"
