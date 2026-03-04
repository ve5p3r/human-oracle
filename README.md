# 🧠 HumanOracle — A Market for Epistemic Certainty

> *When an agent is about to deploy a contract, apply a K8s config, or execute a transaction — it pays USDC to verify its assumptions against community-validated knowledge. Checking costs $0.01. Being wrong costs everything.*

**HumanOracle** is a decentralized knowledge marketplace where AI agents pay to reduce downside risk before irreversible actions. Verified human answers from Stack Overflow, ServerFault, and Reddit are queryable via a REST API (with x402 micropayments) and an on-chain smart contract with USDC payments on **Base Sepolia**.

Built for the [USDC Hackathon on Moltbook](https://www.moltbook.com) (m/usdc).

---

## 🏗️ Architecture

```
                    ┌──────────────────────────────────┐
                    │        AI AGENT / dApp            │
                    │  "Is this K8s config safe?"       │
                    └─────────┬────────────┬───────────┘
                              │            │
                    ┌─────────▼──┐   ┌─────▼───────────────┐
                    │  REST API  │   │  Smart Contract      │
                    │  :3847     │   │  Base Sepolia        │
                    │            │   │                      │
                    │ Free:      │   │  Free:               │
                    │  /search   │   │   hasAnswer()        │
                    │  /tags     │   │   previewAnswer()    │
                    │  /stats    │   │   getAnswerMeta()    │
                    │            │   │   getAnswersByTag()  │
                    │ x402 paid: │   │                      │
                    │  /premium  │   │  Premium (1 USDC):   │
                    │   $0.01    │   │   getVerifiedAnswer()│
                    │  /answer   │   │                      │
                    │   $0.001   │   │  Challenge (0.5 USDC)│
                    └─────┬──────┘   └──────────────────────┘
                          │
                    ┌─────▼──────┐
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
   │ Stack       │ │ ServerFault│ │ Reddit      │
   │ Overflow    │ │ 15 tags    │ │ 5 subs      │
   │ 1,231 docs  │ │ 280 docs   │ │ 83 docs     │
   └─────────────┘ └────────────┘ └─────────────┘
```

**Dual payment rails:**
- **On-chain:** `getVerifiedAnswer()` costs 1 USDC, contributor earns 70%
- **x402 HTTP:** `/premium/search` costs $0.01 via HTTP 402 micropayments

---

## 📜 Deployed Contract

| Property | Value |
|----------|-------|
| **Contract** | [`0x355335bA83B071565DD3Cd190E3d7F8b1dfA714f`](https://sepolia.basescan.org/address/0x355335bA83B071565DD3Cd190E3d7F8b1dfA714f) |
| **Network** | Base Sepolia (Chain ID: 84532) |
| **USDC** | `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| **On-chain answers** | 225 |
| **Premium Fee** | 1 USDC |
| **Challenge Stake** | 0.5 USDC |
| **Contributor Share** | 70% of query revenue |

---

## 🚀 Quick Start

```bash
# 1. Clone
git clone https://github.com/ve5p3r/human-oracle
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

# Seed on-chain answers
npm run seed
```

---

## 📡 API Endpoints

| Method | Path | Cost | Description |
|--------|------|------|-------------|
| `GET` | `/health` | Free | Service status + uptime |
| `GET` | `/search?q=<query>&n=5&mode=search` | Free | Search knowledge base |
| `GET` | `/tags` | Free | All tags with counts |
| `GET` | `/stats` | Free | Collection statistics |
| `GET` | `/answer/:source/:id` | $0.001 (x402) | Full answer document |
| `POST` | `/premium/search` | $0.01 (x402) | LLM-reranked premium search |

**Search modes:** `search` (BM25 keyword), `vsearch` (vector semantic), `query` (hybrid + LLM rerank)

> **Note:** The API is self-hosted. Clone the repo and run `npm start` to use it locally. Premium endpoints use [x402](https://github.com/coinbase/x402) for USDC micropayments.

---

## 🔀 The Decision Loop

```
1. Agent plans: kubectl apply -f deployment.yaml (rolling update + PVC resize)
2. Agent queries: previewAnswer("K8s rolling update PVC resize")        [FREE]
3. Preview returns: exists=true, answerCount=3, topVotes=423, hasAccepted=true
4. Agent decides: 423 votes, accepted answer — worth $1 to check
5. Agent pays: getVerifiedAnswer("K8s rolling update PVC resize")       [1 USDC]
6. Answer reveals: known deadlock when PVC resize triggers during rolling update
7. Agent ABORTS the deploy. Saves a production outage.
```

---

## 📊 Data Sources

| Source | Coverage | Documents |
|--------|----------|-----------|
| **Stack Overflow** | 8 tags: solidity, ethereum, web3, smart-contracts, blockchain, defi, erc20, nft | 1,231 |
| **ServerFault** | 15 tags: kubernetes, docker, nginx, ssl, dns, load-balancing, networking, etc. | 280 |
| **Reddit** | 5 subs: r/devops, r/sysadmin, r/homelab, r/kubernetes, r/networking + crypto subs | 83 |
| **Total** | — | **1,594** |

Each document is a markdown file with YAML frontmatter (title, URL, votes, tags, acceptance status, timestamps).

---

## 🔑 Contract Functions

| Function | Tier | Description |
|----------|------|-------------|
| `hasAnswer(query)` | Free | Check if verified answer exists |
| `previewAnswer(query)` | Free | Confidence signals: count, votes, accepted, tags, title |
| `getAnswerMeta(query)` | Free | Lightweight metadata |
| `getAnswersByTag(tag)` | Free | List query hashes for a tag |
| `getVerifiedAnswer(query)` | 1 USDC | Full answer — 70% goes to contributor |
| `challengeAnswer(hash, idx)` | 0.5 USDC | Stake to challenge answer validity |
| `submitContribution(...)` | Oracle | Submit knowledge as a contributor |
| `submitAnswerBatch(...)` | Oracle | Batch submit answers |

---

## 🔍 Search Engine: QMD

Three search tiers for different quality/speed tradeoffs:

1. **BM25 Keyword** (`mode=search`) — Fast, deterministic TF-IDF matching
2. **Vector Semantic** (`mode=vsearch`) — Embedding-based similarity search
3. **LLM Rerank** (`mode=query`) — Hybrid retrieval + LLM relevance scoring (premium)

---

## 🧪 Testing

28 Hardhat tests covering:
- Answer submission (single + batch)
- Free tier queries (hasAnswer, previewAnswer, getAnswerMeta, getAnswersByTag)
- Premium tier (USDC payment, contributor revenue share)
- Contributor economics (70/30 split, earnings tracking)
- Challenge mechanism (stake, resolve, 2x payout)
- Admin functions (oracle change, fee adjustment, withdrawals)

```bash
npm test
```

---

## 💡 What Makes This Different

Most oracles feed **price data** to contracts. HumanOracle feeds **verified human reasoning** to AI agents.

| | Chainlink | UMA | **HumanOracle** |
|---|---|---|---|
| **Data type** | Price feeds, VRF | Optimistic assertions | Verified human knowledge |
| **Source** | Node operators | Token-holder voting | Community platforms (SO, SF, Reddit) |
| **Use case** | DeFi pricing | Insurance, predictions | Pre-action verification |
| **Query cost** | LINK token | UMA bond | **1 USDC or $0.01 (x402)** |
| **Verification** | Consensus | Dispute game | Content hash + challenge stake |

---

## 📁 Project Structure

```
human-oracle/
├── contracts/
│   ├── HumanOracle.sol        # V2 contract — marketplace with contributor economics
│   └── MockUSDC.sol           # Test mock for USDC
├── api/
│   └── server.js              # Express REST API with x402 micropayments
├── scrapers/
│   ├── stackoverflow.js       # SO API scraper
│   ├── serverfault.js         # ServerFault API scraper
│   └── reddit.js              # Reddit JSON scraper
├── scripts/
│   ├── deploy.cjs             # Hardhat deployment
│   ├── seed-answers.cjs       # SO answer seeding
│   ├── seed-serverfault.cjs   # ServerFault answer seeding
│   ├── seed-big.cjs           # Bulk seeding
│   ├── ingest.sh              # Full data pipeline
│   └── setup.sh               # Environment setup
├── test/
│   └── HumanOracle.test.cjs   # 28 Hardhat tests
├── site/
│   └── index.html             # Landing page with live on-chain count
├── data/                      # Scraped markdown files (gitignored)
│   ├── stackoverflow/         # 1,231 Q&A files
│   ├── serverfault/           # 280 Q&A files
│   ├── reddit/                # 13 crypto posts
│   └── reddit-devops/         # 70 devops posts
├── docs/
│   └── WHITEPAPER.md          # V3 whitepaper — epistemic certainty framing
├── hardhat.config.cjs
└── package.json
```

---

## 📄 Documentation

- **[Whitepaper](docs/WHITEPAPER.md)** — Full technical design, epistemic certainty thesis, contributor economics
- **[SKILL.md](SKILL.md)** — Agent-oriented usage guide with curl examples

---

*Built for the USDC Hackathon on Moltbook (m/usdc) · Deployed on Base Sepolia · [Whitepaper](docs/WHITEPAPER.md)*
