# Airdrop Alpha & Due Diligence Engine

Sistema MVP completo para **auditoria fundamentalista de projetos Web3 (Score 0–100)**, geração de **Plano de Interação Estratégica (Anti-Sybil)** para projetos aprovados (Score ≥ 70) e **monitoramento automático de mudanças em roadmaps/documentações** com alertas via Telegram.

---

## Arquitetura & Fluxo do Pipeline

```text
URL do Projeto (Site / Docs)
        │
        ▼
[1. Web3Scraper]  ──► Extrai texto, links sociais, GitBook/Docs, Roadmap e métricas GitHub
        │
        ▼
[2. DefiLlamaClient] ──► Consulta /protocols (TVL, Chains, Token) e /raises (Funding, VCs)
        │
        ▼
[3. AIDueDiligenceAnalyzer] ──► Gemini 2.5 (google-genai + Structured Outputs Pydantic)
        │                        • Score 0–100 dividido em 6 pilares
        │                        • Veredito: APPROVED (≥70) | WATCHLIST (50–69) | REJECTED (<50)
        │                        • Plano Anti-Sybil (5–7 tarefas) apenas para APPROVED
        ▼
[4. SQLite + SQLAlchemy] ──► Persiste projetos, tarefas interativas e snapshots de roadmap
        │
        ▼
[5. APScheduler + RoadmapMonitor + TelegramNotifier]
        └──► Compara hash SHA-256 / unified diff periodicamente e envia alertas no Telegram
```

---

## Estrutura de Diretórios

```text
airdrop-alpha-engine/
├── backend/
│   ├── app/
│   │   ├── main.py                  # Rotas FastAPI + lifecycle do APScheduler
│   │   ├── config.py                # Configurações tipadas via pydantic-settings
│   │   ├── database.py              # SQLite + SQLAlchemy (Project, AirdropTask, RoadmapSnapshot)
│   │   ├── schemas.py               # Modelos Pydantic (DueDiligenceReport, ScoreBreakdown, API)
│   │   └── services/
│   │       ├── scraper.py           # Scraping de site, Docs/GitBook, Roadmap e GitHub API
│   │       ├── onchain_data.py      # Integração DefiLlama (TVL, Funding, Investors, Chains)
│   │       ├── ai_analyzer.py       # Gemini 2.5 Structured Outputs + fallback heurístico
│   │       ├── monitor.py           # Comparador de hash SHA-256 e diff de páginas
│   │       └── notifier.py          # Alertas formatados em HTML via Telegram Bot API
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── app/                     # Next.js App Router (Dashboard Dark Mode)
│   │   ├── components/              # AnalyzeForm, ProjectCard, ProjectDetailPanel, ScoreRing
│   │   ├── lib/api.ts               # Cliente HTTP tipado para o FastAPI
│   │   └── types/airdrop.ts         # Interfaces TypeScript
│   ├── package.json
│   └── .env.local.example
└── README.md
```

---

## Como Rodar Localmente

### 1. Backend (FastAPI + SQLite + APScheduler)

Requer **Python 3.11+** (compatível também com Python 3.9+).

```bash
cd airdrop-alpha-engine/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edite o arquivo `backend/.env` e configure suas chaves:
- `GEMINI_API_KEY`: gere em [Google AI Studio](https://aistudio.google.com/apikey) (suporta `gemini-2.5-flash` ou `gemini-2.5-pro`).
  > **Nota:** se `GEMINI_API_KEY` não estiver preenchida, o motor opera automaticamente em **modo heurístico local** para você testar o fluxo completo imediatamente.
- `TELEGRAM_BOT_TOKEN` e `TELEGRAM_CHAT_ID`: opcionais, para receber alertas automáticos de projetos aprovados e diffs de roadmap.
- `GITHUB_TOKEN`: opcional, aumenta o rate limit da API do GitHub de 60 para 5.000 req/hora.

Suba a API:

```bash
uvicorn app.main:app --reload --port 8000
```

A documentação interativa Swagger estará disponível em `http://localhost:8000/docs`.

---

### 2. Frontend (Next.js App Router + Tailwind CSS)

Requer **Node.js 18+**.

```bash
cd airdrop-alpha-engine/frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Acesse o dashboard em **`http://localhost:3000`**.

---

## Endpoints Principais da API

| Método | Rota | Descrição |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Status da API, Gemini, Telegram e APScheduler |
| `GET` | `/api/stats` | Métricas agregadas do dashboard |
| `GET` | `/api/projects` | Lista projetos (`?verdict=APPROVED&search=...`) |
| `GET` | `/api/projects/{id}` | Relatório completo de Due Diligence, tasks e histórico de diffs |
| `POST` | `/api/projects/analyze` | Executa o pipeline completo (Scrape → DefiLlama → Gemini → SQLite) |
| `DELETE` | `/api/projects/{id}` | Remove um projeto e seus registros |
| `PATCH` | `/api/projects/{id}/monitoring` | Ativa/pausa o monitoramento ou altera a URL monitorada |
| `POST` | `/api/projects/{id}/check-updates` | Dispara verificação imediata de diff na página monitorada |
| `POST` | `/api/monitor/run-all` | Executa o monitor em todos os projetos ativos |
| `PATCH` | `/api/tasks/{task_id}` | Marca/desmarca uma tarefa do plano Anti-Sybil |
| `POST` | `/api/notifications/test` | Envia mensagem de teste no Telegram configurado |

---

## Critérios de Pontuação (Fundamental Score 0–100)

| Pilar | Peso Máx. | O que é avaliado |
| :--- | :---: | :--- |
| Utilidade & Produto | 20 | Problema real, diferencial técnico, qualidade da documentação |
| Backing & Funding | 20 | Investidores Tier-1, rodadas públicas no DefiLlama Raises |
| TVL & Tração On-Chain | 20 | TVL atual, variação 7d, adoção multi-chain |
| Atividade no GitHub | 15 | Repositórios públicos, estrelas orgânicas, commits recentes |
| Potencial de Airdrop | 15 | Status tokenless, campanhas de pontos/XP/testnet |
| Segurança & Anti-Rug | 10 | Auditorias, transparência, ausência de red flags |

- **≥ 70 (`APPROVED`)**: Aprovado — gera plano Anti-Sybil + ativa monitoramento + alerta no Telegram.
- **50–69 (`WATCHLIST`)**: Em observação — monitora evolução sem alocar farming ativo.
- **< 50 (`REJECTED`)**: Reprovado — descartado para evitar perda de tempo/capital.
