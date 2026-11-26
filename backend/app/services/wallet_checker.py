from __future__ import annotations

import asyncio
import re
from typing import Any, Dict, List

import httpx

# Top 8 EVM networks focused on Airdrop hunting (L1 + major L2s/emerging ecosystems)
EVM_AIRDROP_NETWORKS = [
    ("Ethereum", "ETH", "https://ethereum-rpc.publicnode.com"),
    ("Arbitrum", "ETH", "https://arb1.arbitrum.io/rpc"),
    ("Base", "ETH", "https://mainnet.base.org"),
    ("Optimism", "ETH", "https://mainnet.optimism.io"),
    ("Linea", "ETH", "https://rpc.linea.build"),
    ("Scroll", "ETH", "https://rpc.scroll.io"),
    ("zkSync", "ETH", "https://mainnet.era.zksync.io"),
    ("Berachain", "BERA", "https://rpc.berachain.com"),
]

SOLANA_RPCS = [
    "https://solana-rpc.publicnode.com",
    "https://api.mainnet-beta.solana.com",
]

ETH_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")
SOLANA_ADDRESS_RE = re.compile(r"^[1-9A-HJ-NP-Za-km-z]{32,44}$")


async def _query_evm_chain(
    client: httpx.AsyncClient, name: str, symbol: str, rpc_url: str, address: str
) -> Dict[str, Any]:
    payload = [
        {"jsonrpc": "2.0", "id": 1, "method": "eth_getTransactionCount", "params": [address, "latest"]},
        {"jsonrpc": "2.0", "id": 2, "method": "eth_getBalance", "params": [address, "latest"]},
    ]
    try:
        resp = await client.post(rpc_url, json=payload, timeout=7.0)
        if resp.status_code == 200:
            data = resp.json()
            if isinstance(data, list) and len(data) >= 2:
                by_id = {item.get("id"): item.get("result") for item in data if isinstance(item, dict)}
                tx_hex = by_id.get(1)
                bal_hex = by_id.get(2)
                tx_count = int(tx_hex, 16) if isinstance(tx_hex, str) and tx_hex.startswith("0x") else 0
                bal_wei = int(bal_hex, 16) if isinstance(bal_hex, str) and bal_hex.startswith("0x") else 0
                bal_native = round(bal_wei / 1e18, 5)
                return {
                    "chain": name,
                    "symbol": symbol,
                    "tx_count": tx_count,
                    "balance": bal_native,
                    "active": tx_count > 0 or bal_native >= 0.001,
                    "ok": True,
                }
    except Exception:
        pass

    return {
        "chain": name,
        "symbol": symbol,
        "tx_count": 0,
        "balance": 0.0,
        "active": False,
        "ok": False,
    }


async def _check_evm_wallet(address: str) -> Dict[str, Any]:
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[_query_evm_chain(client, n, sym, url, address) for n, sym, url in EVM_AIRDROP_NETWORKS]
        )

    chains: List[Dict[str, Any]] = list(results)
    total_txs = sum(c["tx_count"] for c in chains)
    active_chains = [c["chain"] for c in chains if c["active"]]
    eth_mainnet = next((c for c in chains if c["chain"] == "Ethereum"), None)
    eth_total_balance = sum(c["balance"] for c in chains if c["symbol"] == "ETH")

    score = 0
    checks: List[Dict[str, str]] = []

    # 1. Ethereum Mainnet footprint (25 pts)
    if eth_mainnet and eth_mainnet["tx_count"] >= 5 and eth_mainnet["balance"] >= 0.005:
        score += 25
        checks.append(
            {
                "label": "Ethereum Mainnet",
                "status": "PASS",
                "detail": f"{eth_mainnet['tx_count']} txs e {eth_mainnet['balance']} ETH na L1 — excelente prova de carteira real.",
            }
        )
    elif eth_mainnet and (eth_mainnet["tx_count"] >= 1 or eth_mainnet["balance"] >= 0.002):
        score += 14
        checks.append(
            {
                "label": "Ethereum Mainnet",
                "status": "WARN",
                "detail": f"{eth_mainnet['tx_count']} tx(s) e {eth_mainnet['balance']} ETH na L1 — recomenda-se manter >= 0.005 ETH e 5+ txs.",
            }
        )
    else:
        checks.append(
            {
                "label": "Ethereum Mainnet",
                "status": "FAIL",
                "detail": "Sem histórico/saldo relevante na Ethereum Mainnet (muitos filtros Sybil exigem atividade na L1).",
            }
        )

    # 2. Multi-chain Airdrop presence (25 pts)
    if len(active_chains) >= 4:
        score += 25
        checks.append(
            {
                "label": "Presença em Redes de Airdrop",
                "status": "PASS",
                "detail": f"Ativa em {len(active_chains)} de {len(chains)} redes ({', '.join(active_chains)}).",
            }
        )
    elif len(active_chains) >= 2:
        score += 15
        checks.append(
            {
                "label": "Presença em Redes de Airdrop",
                "status": "WARN",
                "detail": f"Ativa em {len(active_chains)} redes ({', '.join(active_chains)}) — diversificar em Base/Arbitrum/Linea/Scroll fortalece o perfil.",
            }
        )
    else:
        score += 4
        checks.append(
            {
                "label": "Presença em Redes de Airdrop",
                "status": "FAIL",
                "detail": "Carteira ativa em apenas 0–1 rede — padrão comum em carteiras novas de farm.",
            }
        )

    # 3. Organic transaction count (30 pts)
    if total_txs >= 100:
        score += 30
        checks.append(
            {
                "label": "Histórico de Transações",
                "status": "PASS",
                "detail": f"{total_txs} transações somadas nas redes de airdrop — perfil consolidado.",
            }
        )
    elif total_txs >= 25:
        score += 20
        checks.append(
            {
                "label": "Histórico de Transações",
                "status": "WARN",
                "detail": f"{total_txs} transações somadas — continue acumulando transações orgânicas em semanas distintas.",
            }
        )
    else:
        score += 6 if total_txs > 0 else 0
        checks.append(
            {
                "label": "Histórico de Transações",
                "status": "FAIL",
                "detail": f"Apenas {total_txs} transação(ões) — alto risco de corte por baixa atividade histórica.",
            }
        )

    # 4. Anti-dust ETH balance (20 pts)
    if eth_total_balance >= 0.02:
        score += 20
        checks.append(
            {
                "label": "Saldo Anti-Dust (ETH)",
                "status": "PASS",
                "detail": f"{eth_total_balance:.4f} ETH somados nas redes — acima dos cortes típicos de saldo mínimo.",
            }
        )
    elif eth_total_balance >= 0.005:
        score += 12
        checks.append(
            {
                "label": "Saldo Anti-Dust (ETH)",
                "status": "WARN",
                "detail": f"{eth_total_balance:.4f} ETH — mantenha pelo menos 0.01–0.02 ETH para evitar cortes anti-dust.",
            }
        )
    else:
        checks.append(
            {
                "label": "Saldo Anti-Dust (ETH)",
                "status": "FAIL",
                "detail": f"Saldo muito baixo ({eth_total_balance:.5f} ETH) — carteiras zeradas frequentemente são filtradas.",
            }
        )

    verdict = (
        "FORTE (ANTI-SYBIL)"
        if score >= 75
        else ("MODERADA" if score >= 45 else "RISCO SYBIL")
    )

    return {
        "address": address,
        "wallet_type": "EVM",
        "native_symbol": "ETH",
        "sybil_score": score,
        "verdict": verdict,
        "total_transactions": total_txs,
        "active_chains_count": len(active_chains),
        "total_chains_checked": len(chains),
        "total_eth_balance": round(eth_total_balance, 5),
        "chains": chains,
        "checks": checks,
    }


async def _check_solana_wallet(address: str) -> Dict[str, Any]:
    sol_balance = 0.0
    tx_count = 0
    spl_tokens_count = 0
    active_days_span = 0
    rpc_ok = False

    async with httpx.AsyncClient() as client:
        for rpc in SOLANA_RPCS:
            try:
                bal_req = client.post(
                    rpc,
                    json={"jsonrpc": "2.0", "id": 1, "method": "getBalance", "params": [address]},
                    timeout=8.0,
                )
                sig_req = client.post(
                    rpc,
                    json={
                        "jsonrpc": "2.0",
                        "id": 2,
                        "method": "getSignaturesForAddress",
                        "params": [address, {"limit": 100}],
                    },
                    timeout=8.0,
                )
                tok_req = client.post(
                    rpc,
                    json={
                        "jsonrpc": "2.0",
                        "id": 3,
                        "method": "getTokenAccountsByOwner",
                        "params": [
                            address,
                            {"programId": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"},
                            {"encoding": "jsonParsed"},
                        ],
                    },
                    timeout=8.0,
                )
                bal_resp, sig_resp, tok_resp = await asyncio.gather(bal_req, sig_req, tok_req)

                if bal_resp.status_code == 200 and "result" in bal_resp.json():
                    rpc_ok = True
                    lamports = bal_resp.json()["result"].get("value", 0)
                    sol_balance = round(float(lamports) / 1e9, 5)

                if sig_resp.status_code == 200 and isinstance(sig_resp.json().get("result"), list):
                    sigs = sig_resp.json()["result"]
                    tx_count = len(sigs)
                    times = [s.get("blockTime") for s in sigs if s.get("blockTime")]
                    if len(times) >= 2:
                        active_days_span = max(0, int((max(times) - min(times)) / 86400))

                if tok_resp.status_code == 200 and isinstance(tok_resp.json().get("result"), dict):
                    accounts = tok_resp.json()["result"].get("value", [])
                    non_zero = 0
                    for acc in accounts:
                        try:
                            amt = (
                                acc["account"]["data"]["parsed"]["info"]["tokenAmount"]["uiAmount"]
                                or 0
                            )
                            if float(amt) > 0:
                                non_zero += 1
                        except Exception:
                            continue
                    spl_tokens_count = non_zero

                if rpc_ok:
                    break
            except Exception:
                continue

    score = 0
    checks: List[Dict[str, str]] = []

    # 1. SOL Balance (30 pts)
    if sol_balance >= 0.5:
        score += 30
        checks.append(
            {
                "label": "Saldo Nativo em SOL",
                "status": "PASS",
                "detail": f"{sol_balance} SOL na carteira — bem acima dos cortes anti-dust da Solana.",
            }
        )
    elif sol_balance >= 0.1:
        score += 18
        checks.append(
            {
                "label": "Saldo Nativo em SOL",
                "status": "WARN",
                "detail": f"{sol_balance} SOL — recomenda-se manter >= 0.25–0.5 SOL para boa pontuação em snapshots.",
            }
        )
    else:
        checks.append(
            {
                "label": "Saldo Nativo em SOL",
                "status": "FAIL",
                "detail": f"Saldo muito baixo ({sol_balance} SOL) — alto risco de corte anti-dust em airdrops Solana.",
            }
        )

    # 2. Transaction History (35 pts)
    if tx_count >= 50:
        score += 35
        checks.append(
            {
                "label": "Atividade On-Chain (Solana)",
                "status": "PASS",
                "detail": f"{tx_count}{'+' if tx_count == 100 else ''} transações recentes registradas (janela de {active_days_span} dias).",
            }
        )
    elif tx_count >= 15:
        score += 22
        checks.append(
            {
                "label": "Atividade On-Chain (Solana)",
                "status": "WARN",
                "detail": f"{tx_count} transações registradas — continue interagindo semanalmente em DEXs/lending (Jupiter, Kamino, Drift).",
            }
        )
    else:
        score += 6 if tx_count > 0 else 0
        checks.append(
            {
                "label": "Atividade On-Chain (Solana)",
                "status": "FAIL",
                "detail": f"Apenas {tx_count} transação(ões) encontradas — carteira muito recente ou inativa.",
            }
        )

    # 3. SPL Token Diversity (35 pts)
    if spl_tokens_count >= 5:
        score += 35
        checks.append(
            {
                "label": "Diversidade de Tokens SPL / DeFi",
                "status": "PASS",
                "detail": f"{spl_tokens_count} tokens SPL com saldo ativo — forte sinal de usuário orgânico no ecossistema Solana.",
            }
        )
    elif spl_tokens_count >= 2:
        score += 20
        checks.append(
            {
                "label": "Diversidade de Tokens SPL / DeFi",
                "status": "WARN",
                "detail": f"{spl_tokens_count} tokens SPL com saldo — diversifique com LSTs (JitoSOL/mSOL) e protocolos DeFi.",
            }
        )
    else:
        checks.append(
            {
                "label": "Diversidade de Tokens SPL / DeFi",
                "status": "FAIL",
                "detail": f"Apenas {spl_tokens_count} token(s) SPL — interaja com swaps, staking líquido e vaults na Solana.",
            }
        )

    verdict = (
        "FORTE (ANTI-SYBIL)"
        if score >= 75
        else ("MODERADA" if score >= 45 else "RISCO SYBIL")
    )

    return {
        "address": address,
        "wallet_type": "SOLANA",
        "native_symbol": "SOL",
        "sybil_score": score,
        "verdict": verdict,
        "total_transactions": tx_count,
        "active_chains_count": 1 if (tx_count > 0 or sol_balance > 0) else 0,
        "total_chains_checked": 1,
        "total_eth_balance": sol_balance,
        "chains": [
            {
                "chain": "Solana Mainnet",
                "symbol": "SOL",
                "tx_count": tx_count,
                "balance": sol_balance,
                "active": tx_count > 0 or sol_balance >= 0.01,
                "ok": rpc_ok,
            },
            {
                "chain": "Tokens SPL Ativos",
                "symbol": "SPL",
                "tx_count": spl_tokens_count,
                "balance": float(spl_tokens_count),
                "active": spl_tokens_count > 0,
                "ok": rpc_ok,
            },
        ],
        "checks": checks,
    }


async def check_wallet_anti_sybil(address: str) -> Dict[str, Any]:
    cleaned = address.strip()
    if ETH_ADDRESS_RE.match(cleaned):
        return await _check_evm_wallet(cleaned)
    if SOLANA_ADDRESS_RE.match(cleaned):
        return await _check_solana_wallet(cleaned)
    raise ValueError(
        "Endereço inválido. Informe um endereço público EVM (0x...) ou Solana (Base58)."
    )
