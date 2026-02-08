# HumanOracle: A Market for Epistemic Certainty

**Version 3.0 · February 2026**
**Contract: `0x355335bA83B071565DD3Cd190E3d7F8b1dfA714f` · Base Sepolia**
**Repository: [gitpad.exe.xyz/human-oracle.git](https://gitpad.exe.xyz/human-oracle.git)**

---

## Abstract

HumanOracle is a market for epistemic certainty used by AI agents before irreversible actions. When an agent is about to deploy a contract, configure infrastructure, or execute a transaction, it pays USDC to verify its assumptions against community-validated knowledge — reducing downside risk before commitment.

This is not retrieval. This is **pre-action verification**: pay to reduce the probability that your next irreversible action is based on a hallucination.

---

## 1. The Problem: Irreversible Actions Under Uncertainty

Autonomous agents increasingly perform **irreversible actions** — deploying smart contracts, modifying infrastructure, executing financial transactions. These actions share a critical property: **mistakes are expensive or permanent.**

The agent's confidence in its own reasoning is not a reliable signal. LLMs hallucinate with high confidence. A model that is 95% sure about a Solidity pattern may be confidently wrong about the 5% that causes a reentrancy exploit. A model that "knows" how to configure Kubernetes memory limits may generate a config that OOMs under production load.

**The cost of being wrong is asymmetric.** Checking costs ~$0.01. Deploying a vulnerable contract costs everything in the contract. The rational agent always checks.

Current alternatives don't solve this:
- **RAG** retrieves text. It doesn't verify against community-validated ground truth.
- **Fine-tuning** bakes in training-time knowledge. It can't tell you about the edge case discovered last week.
- **Human review** doesn't scale to autonomous agent operations.

What's missing is a **verification primitive**: a way for agents to pay a small amount to check their assumptions against battle-tested human knowledge before acting.

---

## 2. The Primitive: Pay to Reduce Downside Risk

HumanOracle's core operation:

```
Agent has belief B about to execute irreversible action A
  → Agent calls previewAnswer(B) [FREE]
  → Sees: 12 verified answers, 847 top votes, accepted ✓
  → Agent pays 1 USDC for getVerifiedAnswer(B)
  → Gets: content-hashed, source-linked, challenge-resistant answer
  → Agent proceeds with A (or doesn't)
```

The economics are simple: **the cost of verification must be trivially small relative to the cost of being wrong.** At $0.01-$1.00 per query against potentially unlimited downside, the expected value of checking is always positive.

This is insurance, not search.

---

## 3. Why Only This Architecture Works

### 3.1 Why On-Chain

The verification must be on-chain because **the actions being verified are on-chain.** An agent deploying a contract on Base needs verification that lives in the same trust domain. Off-chain APIs can be spoofed, modified, or taken offline. On-chain content hashes are immutable.

### 3.2 Why USDC

USDC creates a stable unit of account for verification pricing. The cost of checking shouldn't fluctuate with ETH volatility. Agents need predictable costs for risk-adjusted decision-making.

### 3.3 Why Contributor Economics

Knowledge that prevents catastrophic failures is **extremely valuable but undersupplied.** The engineer who discovered that a specific NVMe firmware has a race condition under PCIe gen4 lane rebalancing has no economic incentive to document it publicly. HumanOracle fixes this: contributors earn 70% of every query against their submitted knowledge.

This creates a **defensible flywheel**: more contributors → rarer edge cases documented → higher verification value → more queries → more contributor revenue → more contributors.

### 3.4 Why Dual Payment Rails

Different verification contexts require different payment mechanisms:
- **Smart contract** (1 USDC): Agent verifying assumptions before an on-chain action. Content hash proof lives in the same execution context.
- **x402 HTTP** ($0.01): Agent verifying assumptions before an off-chain action (infrastructure change, API call). No blockchain interaction needed.

### 3.5 Why Challenges

Verification is only valuable if the verified knowledge is correct. The challenge mechanism creates economic skin in the game: anyone can stake 0.5 USDC to dispute an answer. If the challenge is upheld, the challenger gets 2x their stake. This makes submitting bad knowledge economically irrational.

---

## 4. Try Before You Buy

The critical UX insight: **agents shouldn't pay for verification that doesn't exist.**

`previewAnswer()` is free and returns confidence signals:

| Signal | What It Tells the Agent |
|--------|------------------------|
| `exists` | Is there any verified knowledge about this? |
| `answerCount` | How many independent sources confirm? |
| `topVotes` | How strongly validated by the community? |
| `hasAccepted` | Was any answer accepted as canonical? |
| `tags` | What domain does this knowledge cover? |
| `topTitle` | What specific question was answered? |

The agent evaluates these signals and makes a rational decision: if `topVotes > 100` and `hasAccepted == true`, the verification is likely worth $1. If `answerCount == 1` and `topVotes == 2`, maybe not.

---

## 5. What's Verified

**1,594 documents** across three verification domains:

| Domain | Source | Documents | Verification Target |
|--------|--------|-----------|-------------------|
| Smart Contracts | Stack Overflow | 1,231 | Pre-deploy code verification |
| Infrastructure | ServerFault | 280 | Pre-change config verification |
| Operations | Reddit (devops, sysadmin, k8s) | 83 | Pre-action operational verification |

**225 answers on-chain** with content hashes, source URLs, vote counts, and contributor addresses.

This is not a general knowledge base. It's specifically curated for the **domains where agents perform irreversible actions**: deploying code, changing infrastructure, executing transactions.

---

## 6. Technical Implementation

### 6.1 Contract

```solidity
// Free: check before paying
previewAnswer(query) → exists, count, votes, accepted, tags, title

// Paid: get verified answer (70% to contributor, 30% to protocol)
getVerifiedAnswer(query) → contentHash, sourceUrl, votes, accepted, tags, timestamp, title

// Challenge: dispute bad knowledge
challengeAnswer(queryHash, index) → stake 0.5 USDC
resolveChallenge(queryHash, answerIndex, challengeIndex, upheld) → 2x or nothing
```

### 6.2 REST API + x402

```
GET  /search?q=...        → Free BM25/vector search
POST /premium/search      → $0.01 x402 (LLM-reranked)
GET  /preview?q=...       → Free confidence signals
GET  /health, /stats, /tags → Free metadata
```

### 6.3 Testing

28 Hardhat tests covering: submission, preview, free tier, premium payment, contributor economics (70/30 split, earnings tracking), challenge mechanism (stake, payout, resolution), admin functions.

---

## 7. Compounding Defensibility

HumanOracle compounds in three ways:

1. **Data moat** — Every verified answer is an asset. The corpus grows through contributor incentives. Competitors start from zero.

2. **Trust accumulation** — Each successful verification (agent checked → answer was correct → action succeeded) increases trust in the oracle. Trust compounds non-linearly.

3. **Contributor lock-in** — Contributors earn ongoing revenue from their submissions. They're incentivized to submit to HumanOracle specifically, not a competitor, because that's where their existing earnings accumulate.

Alternatives feel naïve because they miss the economic layer. RAG retrieves text but doesn't create contributor incentives. Fine-tuning bakes in knowledge but can't update. API wrappers don't have on-chain verification. Price oracles solve a different problem entirely.

HumanOracle is the only system where **the act of verification creates economic value that funds the next piece of knowledge.**

---

*Contract: `0x355335bA83B071565DD3Cd190E3d7F8b1dfA714f` · Base Sepolia*
*Code: [gitpad.exe.xyz/human-oracle.git](https://gitpad.exe.xyz/human-oracle.git)*
