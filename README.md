# 🧠 HumanOracle — Verified Human Knowledge On-Chain

> *"When an LLM hallucinates, a Stack Overflow answer with 500 upvotes doesn't."*

**HumanOracle** is a decentralized knowledge oracle that makes verified human answers from Stack Overflow and Reddit queryable by AI agents via a REST API and on-chain smart contract with USDC micropayments on Base.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          DATA SOURCES                               │
│  Stack Overflow API ──┐                                             │
│  (8 tags, top Q&A)    ├──▶ Markdown files ──▶ QMD Collection        │
│  Reddit JSON API ─────┘    (YAML frontmatter)  (SQLite + vectors)   │
│  (4 subreddits)                                                     │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │
              ┌────────────────────┴────────────────────┐
              │           QMD SEARCH ENGINE              │
              │  ├─ BM25 keyword search (fast)           │
              │  ├─ Vector semantic search (smart)       │
              │  └─ LLM reranking (premium)              │
              └────────────────────┬────────────────────┘
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
┌────────┴────────┐   ┌───────────┴──────────┐   ┌──────────┴─────────┐
│   REST API      │   │  Smart Contract      │   │   CLI (QMD)        │
│   :3847         │   │  Base Sepolia        │   │   Direct search    │
│                 │   │                      │   │                    │
│  GET /search    │   │  Free:               │   │  qmd search <q>   │
│  GET /answer    │   │   hasAnswer()        │   │  qmd vsearch <q>  │
│  GET /tags      │   │   getAnswerMeta()    │   │  qmd query <q>    │
│  GET /stats     │   │  Premium (1 USDC):   │   │                    │
│  POST /premium  │   │   getVerifiedAnswer()│   │                    │
└─────────────────┘   └──────────────────────┘   └────────────────────┘
```

## Quick Start

```bash
# 1. Clone and install
cd hackathon/human-oracle
npm install

# 2. Run the full pipeline: scrape → index → search
npm run ingest

# 3. Start the API server
npm start

# 4. Search!
curl "http://localhost:3847/search?q=how+to+send+ETH+in+Solidity"
```

## Example Search

```bash
$ curl -s "http://localhost:3847/search?q=reentrancy+guard+pattern" | jq
{
  "query": "reentrancy guard pattern",
  "count": 5,
  "results": [
    {
      "score": 12.34,
      "title": "How to protect against reentrancy attacks in Solidity?",
      "url": "https://stackoverflow.com/questions/12345678",
      "source": "stackoverflow",
      "votes": 234,
      "tags": ["solidity", "smart-contracts", "security"],
      "body_preview": "The checks-effects-interactions pattern..."
    }
  ]
}
```

## Commands

| Command | What it does |
|---------|-------------|
| `npm run ingest` | Full pipeline: scrape SO + Reddit → index into QMD |
| `npm run scrape` | Run scrapers only (no indexing) |
| `npm start` | Start REST API on port 3847 |
| `npm run compile` | Compile Solidity contracts |
| `npm run deploy` | Deploy to Base Sepolia |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Service status + uptime |
| GET | `/search?q=<query>&n=5&mode=search` | Search (modes: search, vsearch, query) |
| GET | `/answer/:source/:id` | Get full answer by source and ID |
| GET | `/tags` | List all tags with counts |
| GET | `/stats` | Collection statistics |
| POST | `/premium/search` | Premium search with LLM reranking |

## Smart Contract

| | |
|---|---|
| **Network** | Base Sepolia (84532) |
| **USDC** | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| **Premium Fee** | 1 USDC |
| **Challenge Stake** | 0.5 USDC |

## Data Sources

- **Stack Overflow**: 8 tags (solidity, ethereum, web3, smart-contracts, blockchain, defi, erc20, nft) — top-voted Q&A with full answer bodies
- **Reddit**: 4 subreddits (r/solidity, r/ethereum, r/ethdev, r/cryptocurrency) — top posts with top comments

## Documentation

- **[Whitepaper](docs/WHITEPAPER.md)** — Full technical whitepaper with architecture, token economics, and comparison to existing oracles
- **[SKILL.md](SKILL.md)** — Agent-oriented usage guide with curl examples

## What Makes This Different

Most oracles feed **price data** to contracts. HumanOracle feeds **verified human reasoning** to agents. An agent about to deploy a Solidity contract can spend 1 USDC to check "is there a known gotcha with this pattern?" and get a verified, community-validated answer — or it can hallucinate and cost someone real money.

---

*Built for the USDC Hackathon on Moltbook (m/usdc)*
