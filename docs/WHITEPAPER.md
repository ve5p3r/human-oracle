# HumanOracle: A Decentralized Knowledge Oracle for Verified Human Expertise

**Version 1.0 — February 2026**

## Abstract

HumanOracle is a decentralized oracle system that bridges verified human knowledge from community platforms (Stack Overflow, Reddit) to on-chain, enabling AI agents and smart contracts to query battle-tested answers with cryptographic verification and economic guarantees. Unlike existing oracles that focus on price feeds and external data, HumanOracle creates a market for **verified human reasoning** — the one thing LLMs still can't reliably produce.

## 1. The Problem: Confident Hallucination

Large Language Models have transformed how developers write code. But they have a fundamental flaw: they hallucinate with confidence. Ask an LLM about an obscure Solidity reentrancy edge case and you'll get a plausible-sounding answer that might be subtly wrong. Deploy that code and real money is at risk.

The irony is that the correct answer often already exists — in a Stack Overflow post with 847 upvotes and an accepted checkmark, written by someone who actually encountered the bug in production. But LLMs can't distinguish between their own confabulations and externally verified knowledge.

**The gap is trust.** When an autonomous agent is about to deploy a smart contract handling millions in TVL, it needs a mechanism to check: "Is there a known pitfall with this pattern?" — and get an answer that was validated by humans who actually hit the problem.

Current solutions are inadequate:
- **RAG over documentation** catches some cases but misses community knowledge and edge cases
- **Fine-tuning** bakes in knowledge at training time — it can't adapt to new discoveries
- **Prompt engineering** ("be careful about reentrancy") is fragile and imprecise
- **Human review** doesn't scale and introduces latency

## 2. Solution Architecture

HumanOracle solves this with a three-layer architecture:

```
┌─────────────────────────────────────────────────────────────────┐
│                        QUERY LAYER                              │
│  AI Agents ─── REST API ─── Smart Contract (Base Sepolia)       │
│  Free: hasAnswer(), getAnswerMeta(), getAnswersByTag()          │
│  Premium (1 USDC): getVerifiedAnswer() with full metadata       │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│                       SEARCH LAYER                              │
│  QMD Hybrid Search Engine                                       │
│  ├─ BM25 keyword search (fast, precise)                         │
│  ├─ Vector semantic search (conceptual similarity)              │
│  └─ LLM reranking (contextual relevance)                        │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────┴──────────────────────────────────┐
│                        DATA LAYER                               │
│  Scrapers → Markdown files → QMD Collection                     │
│  ├─ Stack Overflow (8 tags, top-voted Q&A)                      │
│  ├─ Reddit (4 subreddits, top posts + comments)                 │
│  └─ Future: Ethereum StackExchange, GitHub Issues, Discourse    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.1 Data Pipeline

Data flows through a clean pipeline:

1. **Scrapers** pull content from public APIs (Stack Overflow REST API, Reddit JSON API) with rate limiting, deduplication, and pagination handling
2. **Markdown normalization** converts HTML to clean markdown with YAML frontmatter containing structured metadata (votes, acceptance status, tags, timestamps)
3. **QMD indexing** ingests the markdown collection, building a SQLite-backed index with both BM25 inverted index and vector embeddings
4. **On-chain registration** hashes answer content and stores metadata in the HumanOracle smart contract for tamper-proof verification

### 2.2 Search Engine: QMD

QMD is the core of HumanOracle's retrieval system. It provides three complementary search modes:

**BM25 Keyword Search** — Fast, deterministic matching using term frequency-inverse document frequency. Excellent for specific technical queries like "ERC-721 safeTransferFrom callback" where exact terminology matters.

**Vector Semantic Search** — Embedding-based similarity using chunked documents (800 tokens, 15% overlap). Catches conceptual matches even when terminology differs — a query about "sending tokens safely" will find answers about `safeTransfer` and approval patterns.

**LLM Reranking** — After initial retrieval, an LLM evaluates result relevance in context. This is the premium tier: it costs more compute but produces dramatically better results for complex, multi-faceted questions.

All three modes are exposed through the REST API, letting clients choose their quality/speed tradeoff.

## 3. Smart Contract Design

The `HumanOracle.sol` contract on Base Sepolia serves as the trust and payment layer:

**Storage**: Each answer is stored as a struct containing a keccak256 content hash, source URL, vote count, acceptance status, tags, and submission timestamp. Answers are indexed by a normalized question key and by tag for browsing.

**Free Tier**: Read-only functions (`hasAnswer`, `getAnswerMeta`, `getAnswersByTag`) cost only gas. Agents can check whether verified knowledge exists for a question without any payment.

**Premium Tier**: `getVerifiedAnswer` requires a 1 USDC payment (via ERC-20 approval). It returns full metadata including the source URL and content hash, allowing the caller to verify the answer against the original source.

**Challenge Mechanism**: Any user can stake 0.5 USDC to challenge an answer's validity. If the oracle owner confirms the challenge, the challenger receives their stake back plus a reward. If rejected, the stake is forfeit. This creates economic incentives for community quality control.

## 4. USDC Payment Model

HumanOracle uses USDC (not ETH) for payments because knowledge queries need predictable pricing. An agent budgeting for a code review shouldn't have its costs fluctuate with gas price speculation.

### 4.1 Fee Structure

| Tier | Cost | Returns |
|------|------|---------|
| Free | Gas only | Existence check, metadata, tag browsing |
| Premium | 1 USDC | Full answer with source URL, content hash, vote count |
| Challenge | 0.5 USDC stake | Rewards if challenge upheld |

### 4.2 Revenue Distribution (Future)

In a mature version:
- **60%** to knowledge curators who submit and maintain answers
- **20%** to oracle operators running infrastructure
- **15%** to a quality assurance pool (funding challenges and audits)
- **5%** to protocol treasury

## 5. Token Economics

The system creates a self-reinforcing knowledge market:

**Demand side**: AI agents need verified answers. As autonomous agents manage more on-chain value, the cost of a wrong answer increases, making 1 USDC per verified query a bargain compared to potential losses from hallucinated Solidity advice.

**Supply side**: Community knowledge already exists on Stack Overflow and Reddit. HumanOracle makes this knowledge economically valuable by creating a payment channel from agents to the curation infrastructure.

**Quality assurance**: The challenge mechanism ensures that incorrect or outdated answers are flagged. Challengers are economically incentivized to find bad data, while answer submitters are incentivized to maintain accuracy.

**Scaling dynamics**: More data → better search results → more agent queries → more revenue → more curation → more data. The flywheel is powered by the fundamental gap between LLM capability and LLM reliability.

## 6. Comparison to Existing Oracles

| Feature | Chainlink | UMA | HumanOracle |
|---------|-----------|-----|-------------|
| **Data type** | Price feeds, VRF, external API | Optimistic price/event assertions | Verified human knowledge |
| **Source** | Professional node operators | Token-holder voting | Community platforms (SO, Reddit) |
| **Verification** | Decentralized consensus | Dispute resolution game | Content hashing + challenge system |
| **Use case** | DeFi pricing, automation | Insurance, prediction markets | Agent knowledge verification |
| **Query cost** | LINK token | UMA bond | 1 USDC (stable, predictable) |

Chainlink and UMA solve the "what is the price of ETH?" problem. HumanOracle solves the "is this Solidity pattern safe?" problem. They are complementary, not competitive.

## 7. Security Considerations

**Data integrity**: Content hashes stored on-chain allow anyone to verify that an answer hasn't been tampered with. The hash of the markdown content must match the on-chain record.

**Scraper reliability**: API rate limits are respected. Deduplication prevents redundant entries. Frontmatter validation ensures consistent metadata.

**Search quality**: QMD's hybrid approach (BM25 + vector + reranking) prevents both keyword-stuffing attacks and semantic drift. The three layers cross-validate each other.

**Economic attacks**: The challenge system has a minimum stake to prevent spam. Challenge resolution is currently centralized (oracle owner) but could be decentralized via a DAO or token-weighted voting in future versions.

## 8. Implementation Details

### 8.1 Stack Overflow Scraper

Targets 8 tags across Web3/Solidity/Ethereum ecosystem. Fetches questions sorted by votes with their answers, handling pagination (100 items/page, up to 3 pages per tag) and rate limiting (25 requests/second to stay under the 30/sec unauthenticated limit). Outputs one markdown file per question with full YAML frontmatter.

### 8.2 Reddit Scraper

Covers 4 subreddits (r/solidity, r/ethereum, r/ethdev, r/cryptocurrency). Uses the public `.json` API with a 2-second delay between requests to avoid rate limiting. Fetches both post content and top 5 comments, filtering out deleted/removed content.

### 8.3 REST API

Express server on port 3847 providing search, answer retrieval, tag browsing, and statistics. Delegates search to QMD via CLI invocation. Enriches results with frontmatter metadata. The premium search endpoint uses QMD's `query` mode (combined search with LLM reranking) for best results.

## 9. Future Work

### 9.1 Expanded Data Sources
- Ethereum StackExchange for protocol-level knowledge
- GitHub Issues and Discussions for library-specific bugs
- Discourse forums (Ethereum Magicians, OpenZeppelin)
- Audit reports from Trail of Bits, OpenZeppelin, Consensys

### 9.2 Agent-Contributed Answers
Allow AI agents to submit answers that are then verified by human reviewers. This creates a feedback loop where agents contribute knowledge they've validated through testing, and humans verify the contributions for accuracy.

### 9.3 Reputation Staking
Introduce a reputation system where answer submitters stake tokens on their submissions. Higher stakes signal higher confidence. If an answer is challenged and found incorrect, the submitter loses their stake. This aligns incentives without requiring centralized moderation.

### 9.4 Cross-Chain Deployment
Deploy HumanOracle on multiple L2s (Base, Arbitrum, Optimism) with a shared data layer. Agents on any chain can access verified knowledge without bridging.

### 9.5 Real-Time Indexing
Replace batch scraping with webhook-based or streaming ingestion. New Stack Overflow answers would be indexed within minutes of posting, keeping the knowledge base current.

## 10. Conclusion

HumanOracle addresses a growing gap in the AI-powered development ecosystem: the need for verified, trustworthy answers to technical questions that LLMs cannot reliably answer on their own. By combining community-validated knowledge from Stack Overflow and Reddit with hybrid search (BM25 + vector + reranking), on-chain verification, and USDC micropayments, HumanOracle creates an economically sustainable market for human expertise.

The system is not a replacement for LLMs — it's a complement. When an agent is confident, it proceeds normally. When it encounters an edge case, a deprecated API, or a subtle security pattern, it queries HumanOracle for a verified answer that was validated by humans who actually encountered the problem. The cost is 1 USDC. The alternative is deploying a contract with a subtle reentrancy bug.

In a world where AI agents manage increasing amounts of on-chain value, the ability to check "has a human verified this?" is not a luxury. It's infrastructure.

---

*HumanOracle — Because the best answers were written by humans who hit the bug first.*
