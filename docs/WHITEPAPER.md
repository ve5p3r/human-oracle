# HumanOracle: A Decentralized Knowledge Oracle for Verified Human Expertise

**Version 1.0 · February 2026**
**Network: Base Sepolia (Chain ID 84532) · Payment: USDC**
**Repository: [gitpad.exe.xyz/human-oracle.git](https://gitpad.exe.xyz/human-oracle.git)**

---

## Abstract

HumanOracle is a decentralized oracle system that bridges verified human knowledge from community platforms (Stack Overflow, Reddit) to on-chain, enabling AI agents and smart contracts to query battle-tested answers with cryptographic verification and economic guarantees. Unlike existing oracles that focus on price feeds and external data, HumanOracle creates a market for **verified human reasoning** — the one thing LLMs still can't reliably produce.

The system indexes 1,244 documents across 8 Stack Overflow tags and 4 Reddit communities, serves them via a hybrid search engine (BM25 + vector + LLM reranking), and anchors trust through a Solidity smart contract with USDC-gated premium queries and an economic challenge mechanism.

---

## 1. The Problem: Confident Hallucination

Large Language Models have transformed how developers write code. But they have a fundamental flaw: **they hallucinate with confidence**. Ask an LLM about an obscure Solidity reentrancy edge case and you'll get a plausible-sounding answer that might be subtly wrong. Deploy that code and real money is at risk.

The irony is that the correct answer often already exists — in a Stack Overflow post with 847 upvotes and an accepted checkmark, written by someone who actually encountered the bug in production. But LLMs can't distinguish between their own confabulations and externally verified knowledge.

**The gap is trust.** When an autonomous agent is about to deploy a smart contract handling millions in TVL, it needs a mechanism to check: *"Is there a known pitfall with this pattern?"* — and get an answer that was validated by humans who actually hit the problem.

Current solutions are inadequate:
- **RAG over documentation** catches some cases but misses community knowledge and edge cases
- **Fine-tuning** bakes in knowledge at training time — it can't adapt to new discoveries
- **Prompt engineering** ("be careful about reentrancy") is fragile and imprecise
- **Human review** doesn't scale and introduces latency

HumanOracle fills this gap: a real-time, economically incentivized bridge between community-validated knowledge and on-chain agents.

## 2. Solution Architecture

HumanOracle is organized into three layers that separate concerns cleanly:

```
┌─────────────────────────────────────────────────────────────────┐
│                        QUERY LAYER                              │
│                                                                 │
│  AI Agents ─── REST API (:3847) ─── Smart Contract (Base)       │
│                                                                 │
│  Free:    hasAnswer() · getAnswerMeta() · getAnswersByTag()     │
│  Premium: getVerifiedAnswer() — 1 USDC per query               │
│  Challenge: challengeAnswer() — 0.5 USDC stake                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│                       SEARCH LAYER                              │
│                                                                 │
│  QMD Hybrid Search Engine (SQLite + vector store)               │
│  ├─ BM25 keyword search     — fast, precise term matching       │
│  ├─ Vector semantic search  — conceptual similarity             │
│  └─ LLM reranking           — contextual relevance scoring      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│                        DATA LAYER                               │
│                                                                 │
│  Scrapers → Markdown (YAML frontmatter) → QMD Collection        │
│  ├─ Stack Overflow: 8 tags, 1,231 top-voted Q&A documents       │
│  ├─ Reddit: 4 subreddits, 13 curated posts + top comments       │
│  └─ Future: Ethereum StackExchange, GitHub Issues, Discourse    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Data Pipeline

Data flows through a deterministic, reproducible pipeline:

1. **Scrapers** pull content from public APIs (Stack Overflow REST API v2.3, Reddit public JSON API) with configurable rate limiting, deduplication by ID, and multi-page pagination
2. **Markdown normalization** converts HTML to clean markdown with YAML frontmatter containing structured metadata: votes, acceptance status, tags, source URLs, timestamps, author info, and view counts
3. **QMD indexing** ingests the markdown collection into a SQLite-backed store with both BM25 inverted index and vector embeddings (800-token chunks, 15% overlap)
4. **On-chain registration** hashes answer content with keccak256 and stores metadata in the HumanOracle smart contract for tamper-proof verification

The pipeline is idempotent — re-running `npm run ingest` only processes new or updated content, making it safe for continuous curation.

### 2.2 Search Engine: QMD

QMD is the retrieval backbone. It provides three complementary search modes, each optimized for different query characteristics:

**BM25 Keyword Search** (`mode=search`) — Fast, deterministic matching using term frequency-inverse document frequency over the full document corpus. Excellent for specific technical queries like "ERC-721 safeTransferFrom callback" where exact terminology matters. Sub-100ms latency.

**Vector Semantic Search** (`mode=vsearch`) — Embedding-based cosine similarity using chunked documents (800 tokens, 15% overlap). Catches conceptual matches even when terminology differs — a query about "sending tokens safely" will find answers about `safeTransfer` and approval patterns. Handles synonyms, paraphrases, and cross-lingual queries.

**LLM Reranking** (`mode=query`) — After initial retrieval via BM25+vector fusion, an LLM evaluates result relevance in the context of the original question. This is the premium tier: higher compute cost but dramatically better results for complex, multi-faceted questions. Ideal for "should I use X or Y for Z?" style queries.

All three modes are exposed through the REST API's `mode` parameter, letting clients choose their quality/speed/cost tradeoff.

### 2.3 REST API

The Express.js server on port 3847 provides a clean JSON API:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service health, uptime |
| `/search?q=...&n=5&mode=search` | GET | Search with mode selection |
| `/answer/:source/:id` | GET | Full document by source + ID |
| `/tags` | GET | Tag frequency distribution |
| `/stats` | GET | Corpus statistics |
| `/premium/search` | POST | LLM-reranked premium search |

The API enriches QMD search results with frontmatter metadata (votes, tags, URLs, acceptance status), giving agents structured, actionable responses rather than raw text.

## 3. Smart Contract Design

The `HumanOracle.sol` contract on Base Sepolia serves as the trust anchor and payment layer. It is the single source of truth for answer provenance and economic incentives.

### 3.1 Storage Model

Each answer is stored as a struct:

```solidity
struct Answer {
    bytes32 contentHash;    // keccak256 of the full answer body
    string  sourceUrl;      // Stack Overflow/Reddit permalink
    uint256 votes;          // community vote count at curation time
    bool    accepted;       // was this the accepted answer?
    string[] tags;          // e.g. ["solidity", "ethereum"]
    uint256 timestamp;      // block.timestamp when submitted
    string  questionTitle;  // human-readable question
}
```

Answers are indexed by `keccak256(normalize(query))` — a case-insensitive ASCII normalization ensures consistent lookups regardless of casing. A secondary tag index maps tag strings to query hashes for browsable tag-based discovery.

### 3.2 Access Tiers

**Free Tier** — Read-only view functions costing only gas:
- `hasAnswer(query)` → bool: existence check
- `getAnswerMeta(query)` → (count, tags, topVotes): lightweight metadata
- `getAnswersByTag(tag)` → bytes32[]: all query hashes for a tag
- `getAnswerCount(queryHash)` → uint256: answer count by hash

**Premium Tier** — `getVerifiedAnswer(query)` requires a 1 USDC ERC-20 approval. Returns the highest-voted answer's full metadata including content hash, source URL, and vote count. The content hash allows the caller to verify answer integrity against the original source.

### 3.3 Challenge Mechanism

Any user can stake 0.5 USDC to challenge an answer's validity via `challengeAnswer(queryHash, index)`. This creates economic skin-in-the-game for quality control:

- If the oracle owner confirms the challenge → challenger receives stake back + reward
- If rejected → stake is forfeit
- Creates a marketplace incentive to identify outdated, incorrect, or manipulated answers

### 3.4 Technical Specifications

- **Solidity version:** 0.8.24 with viaIR optimization (200 runs)
- **Dependencies:** OpenZeppelin v5 (Ownable, SafeERC20, IERC20)
- **USDC address:** `0x036CbD53842c5426634e7929541eC2318f3dCF7e` (Base Sepolia)
- **Gas optimization:** Batch submission via `submitAnswerBatch()` amortizes per-answer overhead

## 4. USDC Payment Model

HumanOracle uses USDC (not ETH) for payments because knowledge queries need **predictable pricing**. An agent budgeting for a code review shouldn't have its costs fluctuate with gas price speculation. USDC provides:

- **Stable unit cost:** 1 USDC per premium query, always
- **Familiar denomination:** Agents can reason about cost in dollar terms
- **Base L2 efficiency:** Sub-cent gas costs on Base Sepolia make micropayments viable
- **ERC-20 composability:** Standard approve/transfer flow integrates with any wallet or agent framework

### 4.1 Fee Structure

| Tier | Cost | Returns |
|------|------|---------|
| Free | Gas only (~$0.001 on Base) | Existence check, metadata, tag browsing |
| Premium | 1 USDC | Full answer with source URL, content hash, vote count |
| Challenge | 0.5 USDC stake | Reward if challenge upheld; forfeit if rejected |

### 4.2 Revenue Distribution (Future)

In a production deployment:
- **60%** to knowledge curators who submit and maintain answers
- **20%** to oracle operators running infrastructure
- **15%** to a quality assurance pool (funding challenges and audits)
- **5%** to protocol treasury

## 5. Token Economics

The system creates a self-reinforcing knowledge market:

**Demand side:** AI agents need verified answers. As autonomous agents manage more on-chain value, the cost of a wrong answer increases, making 1 USDC per verified query a bargain compared to potential losses from hallucinated Solidity advice. A single reentrancy bug can drain millions — checking for known pitfalls is asymmetrically valuable.

**Supply side:** Community knowledge already exists on Stack Overflow (50M+ questions) and Reddit. HumanOracle makes this knowledge economically valuable by creating a payment channel from agents to the curation infrastructure.

**Quality assurance:** The challenge mechanism ensures incorrect or outdated answers are flagged. Challengers are economically incentivized to find bad data, while answer submitters are incentivized to maintain accuracy.

**Scaling dynamics:** More data → better search results → more agent queries → more revenue → more curation → more data. The flywheel is powered by the fundamental gap between LLM capability and LLM reliability.

## 6. Comparison to Existing Oracles

| Feature | Chainlink | UMA | **HumanOracle** |
|---------|-----------|-----|-----------------|
| **Data type** | Price feeds, VRF, external API | Optimistic price/event assertions | **Verified human knowledge** |
| **Source** | Professional node operators | Token-holder voting | **Community platforms (SO, Reddit)** |
| **Verification** | Decentralized consensus | Dispute resolution game | **Content hashing + challenge system** |
| **Use case** | DeFi pricing, automation | Insurance, prediction markets | **Agent knowledge verification** |
| **Query cost** | LINK token (variable) | UMA bond (variable) | **1 USDC (stable, predictable)** |
| **Data freshness** | Real-time feeds | Event-driven | **Batch + real-time pipeline** |

**Key insight:** Chainlink and UMA answer *"what is the price of ETH?"* — HumanOracle answers *"is this Solidity pattern safe?"* They are complementary, not competitive. An agent might use Chainlink for price data and HumanOracle for technical knowledge verification in the same transaction.

## 7. Security Considerations

### 7.1 Data Integrity
Content hashes stored on-chain (keccak256 of the full answer body) allow anyone to verify that an answer hasn't been tampered with. The hash of the markdown content must match the on-chain record — any modification is cryptographically detectable.

### 7.2 Scraper Reliability
- API rate limits are respected (25 req/sec for SO, 2-second delays for Reddit)
- Deduplication by ID prevents redundant entries
- YAML frontmatter validation ensures consistent metadata
- Idempotent ingestion: safe to re-run without corruption

### 7.3 Search Quality
QMD's hybrid approach (BM25 + vector + LLM reranking) prevents both keyword-stuffing attacks and semantic drift. The three layers cross-validate each other, making it difficult to game search rankings without genuinely relevant content.

### 7.4 Economic Security
- Challenge mechanism has a minimum 0.5 USDC stake to prevent spam
- Premium query fees create economic cost for data extraction attempts
- Oracle role separation (owner vs. oracle) provides operational security
- Challenge resolution is currently centralized (oracle owner) but designed for future DAO governance

### 7.5 Smart Contract Security
- Built on battle-tested OpenZeppelin v5 primitives (Ownable, SafeERC20)
- No external calls to untrusted contracts (only USDC transfers)
- Compiled with Solidity 0.8.24 (overflow protection built-in)
- viaIR optimization with 200 runs for gas efficiency

## 8. Implementation Details

### 8.1 Stack Overflow Scraper
Targets 8 tags across the Web3/Solidity/Ethereum ecosystem. Fetches questions sorted by votes with their full answer bodies via the `withbody` filter. Handles pagination (100 items/page, up to 3 pages per tag), rate limiting (25 req/sec), API quota tracking, and graceful retry on 429/502 errors. Outputs one markdown file per question with comprehensive YAML frontmatter. Current corpus: **1,231 documents**.

### 8.2 Reddit Scraper
Covers 4 subreddits (r/solidity, r/ethereum, r/ethdev, r/cryptocurrency). Uses the public `.json` API with a 2-second inter-request delay. Fetches both post content and top 5 comments, filtering out deleted/removed content. Generates markdown with author attribution and community scores. Current corpus: **13 documents**.

### 8.3 REST API
Express.js server on port 3847. Delegates search to QMD via CLI invocation with configurable search mode. Enriches results with parsed YAML frontmatter metadata. The premium search endpoint uses QMD's `query` mode (combined BM25+vector retrieval with LLM reranking) for highest-quality results. Handles errors gracefully with proper HTTP status codes and JSON error responses.

### 8.4 On-Chain Seeding
The seed script (`seed-answers.js`) fetches top-voted questions from the Stack Overflow API, hashes their bodies with keccak256, and submits them to the contract in batches of 10 via `submitAnswerBatch()`. This amortizes gas costs while providing a representative on-chain knowledge base for demonstration.

## 9. Future Work

### 9.1 Expanded Data Sources
- Ethereum StackExchange for protocol-level knowledge
- GitHub Issues and Discussions for library-specific bugs
- Discourse forums (Ethereum Magicians, OpenZeppelin)
- Audit reports from Trail of Bits, OpenZeppelin, Consensys Diligence

### 9.2 Agent-Contributed Answers
Allow AI agents to submit answers that are then verified by human reviewers. This creates a feedback loop where agents contribute knowledge they've validated through testing, and humans verify the contributions for accuracy — a human-in-the-loop knowledge market.

### 9.3 Reputation Staking
Introduce a reputation system where answer submitters stake tokens on their submissions. Higher stakes signal higher confidence. If an answer is challenged and found incorrect, the submitter loses their stake. This aligns incentives without requiring centralized moderation.

### 9.4 Cross-Chain Deployment
Deploy HumanOracle on multiple L2s (Base, Arbitrum, Optimism) with a shared data layer via CCIP or similar messaging protocol. Agents on any chain can access verified knowledge without bridging.

### 9.5 Real-Time Indexing
Replace batch scraping with webhook-based or streaming ingestion. New Stack Overflow answers would be indexed within minutes of posting, keeping the knowledge base current with the latest community discoveries.

### 9.6 Decentralized Governance
Migrate challenge resolution from oracle-owner to a DAO or token-weighted voting system, fully decentralizing quality control. Knowledge curators earn governance rights proportional to their contribution quality.

## 10. Conclusion

HumanOracle addresses a growing gap in the AI-powered development ecosystem: the need for **verified, trustworthy answers** to technical questions that LLMs cannot reliably answer on their own. By combining community-validated knowledge from Stack Overflow and Reddit with hybrid search (BM25 + vector + LLM reranking), on-chain verification via content hashing, and USDC micropayments on Base, HumanOracle creates an economically sustainable market for human expertise.

The system is not a replacement for LLMs — it's a **complement**. When an agent is confident, it proceeds normally. When it encounters an edge case, a deprecated API, or a subtle security pattern, it queries HumanOracle for a verified answer that was validated by humans who actually encountered the problem. The cost is 1 USDC. The alternative is deploying a contract with a subtle reentrancy bug.

In a world where AI agents manage increasing amounts of on-chain value, the ability to check *"has a human verified this?"* is not a luxury. **It's infrastructure.**

---

*HumanOracle — Because the best answers were written by humans who hit the bug first.*
