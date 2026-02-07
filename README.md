# 🧠 HumanOracle — Verified Human Knowledge On-Chain

> *"When an LLM hallucinates, a Stack Overflow answer with 500 upvotes doesn't."*

**HumanOracle** is a decentralized knowledge oracle that makes verified human answers from Stack Overflow and Reddit queryable by AI agents via a REST API and on-chain smart contract with USDC micropayments on **Base Sepolia**.

Built for the [USDC Hackathon on Moltbook](https://www.moltbook.com) (m/usdc).

---

## 🏗️ Architecture

```
                    ┌──────────────────────────────────┐
                    │        AI AGENT / dApp            │
                    │  "Is this Solidity pattern safe?" │
                    └─────────┬────────────┬───────────┘
                              │            │
                    ┌─────────▼──┐   ┌─────▼───────────────┐
                    │  REST API  │   │  Smart Contract      │
                    │  :3847     │   │  Base Sepolia        │
                    │            │   │                      │
                    │ /search    │   │  Free:               │
                    │ /answer    │   │   hasAnswer()        │
                    │ /tags      │   │   getAnswerMeta()    │
                    │ /stats     │   │   getAnswersByTag()  │
                    │ /premium   │   │  Premium (1 USDC):   │
                    └─────┬──────┘   │   getVerifiedAnswer()│
                          │          │  Challenge (0.5 USDC)│
                    ┌─────▼──────┐   └──────────────────────┘
                    │  QMD SEARCH │
                    │  ENGINE     │
                    │             │
                    │ BM25 keyword│
                    │ Vector sim. │
                    │ LLM rerank  │
                    └─────┬──────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
   ┌──────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐
   │ Stack       │ │ Reddit     │ │ Future:     │
   │ Overflow    │ │ 4 subs     │ │ GH Issues   │
   │ 8 tags      │ │ r/solidity │ │ Discourse   │
   │ 1,231 docs  │ │ r/ethdev   │ │ Audit repos │
   └─────────────┘ └────────────┘ └─────────────┘
```

**Data pipeline:** Scrapers → Markdown (YAML frontmatter) → QMD Collection (SQLite + vectors) → REST API + On-chain hashes

---

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://gitpad.exe.xyz/human-oracle.git
cd human-oracle

# 2. Install dependencies
npm install

# 3. Run the full pipeline: scrape → index → search
npm run ingest

# 4. Start the API server
npm start

# 5. Search!
curl "http://localhost:3847/search?q=reentrancy+guard+pattern"
```

### Deploy the Contract

```bash
# Set your funded wallet's private key
echo "PRIVATE_KEY=0xYourPrivateKey" > .env

# Compile & deploy to Base Sepolia
npm run compile
npm run deploy

# Seed on-chain answers from Stack Overflow
npm run seed
```

---

## 📡 API Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| `GET` | `/health` | Service status + uptime | — |
| `GET` | `/search?q=<query>&n=5&mode=search` | Search knowledge base | — |
| `GET` | `/answer/:source/:id` | Full answer by source/ID | — |
| `GET` | `/tags` | All tags with counts | — |
| `GET` | `/stats` | Collection statistics | — |
| `POST` | `/premium/search` | LLM-reranked search | USDC* |

**Search modes:** `search` (BM25 keyword), `vsearch` (vector semantic), `query` (hybrid + LLM rerank)

*\*Testnet mode: premium searches are free. Production would gate via on-chain USDC payment verification.*

### Example Response

```json
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

---

## 📜 Smart Contract

**`HumanOracle.sol`** — Solidity 0.8.24, OpenZeppelin v5, optimized with viaIR

| Property | Value |
|----------|-------|
| **Network** | Base Sepolia (Chain ID: 84532) |
| **USDC** | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| **Premium Fee** | 1 USDC |
| **Challenge Stake** | 0.5 USDC |

### Contract Functions

| Function | Tier | Description |
|----------|------|-------------|
| `hasAnswer(query)` | Free | Check if verified answer exists |
| `getAnswerMeta(query)` | Free | Get answer count, tags, top votes |
| `getAnswersByTag(tag)` | Free | List query hashes for a tag |
| `getVerifiedAnswer(query)` | 1 USDC | Full answer with content hash + source URL |
| `challengeAnswer(hash, idx)` | 0.5 USDC | Stake to challenge answer validity |
| `submitAnswer(...)` | Oracle | Submit verified answer |
| `submitAnswerBatch(...)` | Oracle | Batch submit answers |

---

## 📊 Data Sources

| Source | Coverage | Documents |
|--------|----------|-----------|
| **Stack Overflow** | 8 tags: solidity, ethereum, web3, smart-contracts, blockchain, defi, erc20, nft | 1,231 |
| **Reddit** | 4 subs: r/solidity, r/ethereum, r/ethdev, r/cryptocurrency | 13 |
| **Total** | — | **1,244** |

Each document is a markdown file with YAML frontmatter (title, URL, votes, tags, acceptance status, timestamps).

---

## 🔍 Search Engine: QMD

Three search tiers for different quality/speed tradeoffs:

1. **BM25 Keyword** (`mode=search`) — Fast, deterministic TF-IDF matching. Best for specific technical queries.
2. **Vector Semantic** (`mode=vsearch`) — Embedding-based similarity. Catches conceptual matches across different terminology.
3. **LLM Rerank** (`mode=query`) — Hybrid retrieval + LLM relevance scoring. Premium tier — best results for complex questions.

---

## 🧪 Commands

| Command | What it does |
|---------|-------------|
| `npm run ingest` | Full pipeline: scrape SO + Reddit → index into QMD |
| `npm run scrape` | Run scrapers only (no indexing) |
| `npm start` | Start REST API on port 3847 |
| `npm run compile` | Compile Solidity contracts |
| `npm run deploy` | Deploy to Base Sepolia (needs `PRIVATE_KEY` in `.env`) |
| `npm run seed` | Seed on-chain answers from SO API |
| `npm test` | Run Hardhat tests |

---

## 💡 What Makes This Different

Most oracles feed **price data** to contracts. HumanOracle feeds **verified human reasoning** to AI agents.

| | Chainlink | UMA | **HumanOracle** |
|---|---|---|---|
| **Data type** | Price feeds, VRF | Optimistic assertions | Verified human knowledge |
| **Source** | Node operators | Token-holder voting | Community platforms (SO, Reddit) |
| **Use case** | DeFi pricing | Insurance, predictions | Agent knowledge verification |
| **Query cost** | LINK token | UMA bond | **1 USDC (stable)** |
| **Verification** | Consensus | Dispute game | Content hash + challenge |

An agent about to deploy a Solidity contract can spend 1 USDC to check *"is there a known gotcha with this pattern?"* and get a verified, community-validated answer — or it can hallucinate and cost someone real money.

---

## 📄 Documentation

- **[Whitepaper](docs/WHITEPAPER.md)** — Full technical design, token economics, and security analysis
- **[SKILL.md](SKILL.md)** — Agent-oriented usage guide with curl examples

---

## 📁 Project Structure

```
human-oracle/
├── contracts/
│   └── HumanOracle.sol       # Solidity smart contract
├── api/
│   └── server.js              # Express REST API
├── scrapers/
│   ├── stackoverflow.js       # SO API scraper
│   └── reddit.js              # Reddit JSON scraper
├── scripts/
│   ├── deploy.js              # Hardhat deployment
│   ├── seed-answers.js        # On-chain answer seeding
│   ├── ingest.sh              # Full data pipeline
│   └── setup.sh               # Environment setup
├── data/                      # Scraped markdown files (gitignored)
│   ├── stackoverflow/         # 1,231 Q&A files
│   └── reddit/                # 13 post files
├── docs/
│   └── WHITEPAPER.md          # Technical whitepaper
├── hardhat.config.js
└── package.json
```

---

*Built for the USDC Hackathon on Moltbook (m/usdc) · Deployed on Base Sepolia · [Whitepaper](docs/WHITEPAPER.md)*
