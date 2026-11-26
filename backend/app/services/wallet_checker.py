from __future__ import annotations

import asyncio
import re
from typing import Any, Dict, List

import httpx

EVM_NETWORKS = [
    ("Ethereum", "ETH", "https://ethereum-rpc.publicnode.com"),
    ("Arbitrum", "ETH", "https://arb1.arbitrum.io/rpc"),
    ("Base", "ETH", "https://mainnet.base.org"),
    ("Optimism", "ETH", "https://mainnet.optimism.io"),
    ("Polygon", "POL", "https://polygon-bor-rpc.publicnode.com"),
    ("BNB Chain", "BNB", "https://bsc-rpc.publicnode.com"),
]

ETH_ADDRESS_RE = re.compile(r"^0x[a-fA-F0-9]{40}$")


async def _query_chain(
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


async def check_wallet_anti_sybil(address: str) -> Dict[str, Any]:
    cleaned = address.strip()
    if not ETH_ADDRESS_RE.match(cleaned):
        raise ValueError("Endereço EVM inválido. Use o formato 0x seguido de 40 caracteres hexadecimais.")

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[_query_chain(client, n, sym, url, cleaned) for n, sym, url in EVM_NETWORKS]
        )

    chains: List[Dict[str, Any]] = list(results)
    total_txs = sum(c["tx_count"] for c in chains)
    active_chains = [c["chain"] for c in chains if c["active"]]
    eth_mainnet = next((c for c in chains if c["chain"] == "Ethereum"), None)
    eth_l2_balance = sum(
        c["balance"] for c in chains if c["symbol"] == "ETH"
    )

    # Anti-Sybil Health Score (0-100)
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

    # 2. Multi-chain presence (25 pts)
    if len(active_chains) >= 4:
        score += 25
        checks.append(
            {
                "label": "Diversificação Multi-Chain",
                "status": "PASS",
                "detail": f"Ativa em {len(active_chains)} redes ({', '.join(active_chains)}).",
            }
        )
    elif len(active_chains) >= 2:
        score += 15
        checks.append(
            {
                "label": "Diversificação Multi-Chain",
                "status": "WARN",
                "detail": f"Ativa em {len(active_chains)} redes ({', '.join(active_chains)}) — expandir para Base/Arbitrum/Optimism reduz risco Sybil.",
            }
        )
    else:
        score += 4
        checks.append(
            {
                "label": "Diversificação Multi-Chain",
                "status": "FAIL",
                "detail": "Carteira ativa em apenas 0–1 rede — padrão comum em carteiras recém-criadas para farm.",
            }
        )

    # 3. Organic transaction count (30 pts)
    if total_txs >= 100:
        score += 30
        checks.append(
            {
                "label": "Histórico de Transações",
                "status": "PASS",
                "detail": f"{total_txs} transações somadas nas 6 redes — perfil consolidado.",
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
    if eth_l2_balance >= 0.02:
        score += 20
        checks.append(
            {
                "label": "Saldo Anti-Dust (ETH)",
                "status": "PASS",
                "detail": f"{eth_l2_balance:.4f} ETH somados em L1/L2s — acima dos cortes típicos de saldo mínimo.",
            }
        )
    elif eth_l2_balance >= 0.005:
        score += 12
        checks.append(
            {
                "label": "Saldo Anti-Dust (ETH)",
                "status": "WARN",
                "detail": f"{eth_l2_balance:.4f} ETH — mantenha pelo menos 0.01–0.02 ETH para não cair em filtros anti-dust.",
            }
        )
    else:
        checks.append(
            {
                "label": "Saldo Anti-Dust (ETH)",
                "status": "FAIL",
                "detail": f"Saldo muito baixo ({eth_l2_balance:.5f} ETH) — carteiras zeradas frequentemente são desqualificadas no snapshot.",
            }
        )

    verdict = (
        "FORTE (ANTI-SYBIL)"
        if score >= 75
        else ("MODERADA" if score >= 45 else "RISCO SYBIL")
    )

    return {
        "address": cleaned,
        "sybil_score": score,
        "verdict": verdict,
        "total_transactions": total_txs,
        "active_chains_count": len(active_chains),
        "total_eth_balance": round(eth_l2_balance, 5),
        "chains": chains,
        "checks": checks,
    }
