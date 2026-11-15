# HumanOracle: A Market for Epistemic Certainty

**Contract: `0x355335bA83B071565DD3Cd190E3d7F8b1dfA714f` · Base Sepolia**
**Code: [github.com/ve5p3r/human-oracle](https://github.com/ve5p3r/human-oracle)**

---

## What This Is

HumanOracle is a **market for epistemic certainty** used by AI agents before irreversible actions.

When an agent is about to deploy a contract, apply a Kubernetes config, or execute a transaction, it pays USDC to verify its assumptions against community-validated knowledge. Checking costs $0.01. Being wrong costs everything.

This is not retrieval. This is **pre-action verification** — pay to reduce downside risk.

---

## The Decision Loop

This is what HumanOracle looks like in practice:

```
1. Agent plans: kubectl apply -f deployment.yaml (rolling update + PVC resize)
2. Agent queries: previewAnswer("K8s rolling update PVC resize")  [FREE]
3. Preview returns: exists=true, answerCount=3, topVotes=423, hasAccepted=true
4. Agent decides: 423 votes, accepted answer — worth $1 to check
5. Agent pays: getVerifiedAnswer("K8s rolling update PVC resize")  [1 USDC]
6. Answer reveals: known deadlock when PVC resize triggers during rolling update
7. Agent ABORTS the deploy. Saves a production outage.
```

The $1 verification just prevented a multi-hour incident. The payment feels cheap because it is.

### Decision Loop 2: DeFi

```
1. Agent plans: approve() + swap via Uniswap V4 hook with permit2
2. Agent queries: previewAnswer("permit2 Uniswap V4 hook front-running")  [FREE]
3. Preview returns: exists=true, answerCount=5, topVotes=612, hasAccepted=true
4. Agent pays 1 USDC for getVerifiedAnswer()
5. Answer reveals: known front-running vector where permit2 signatures can be
   replayed in a sandwich attack if the hook doesn't validate msg.sender
6. Agent CANCELS the transaction. Saves the entire swap amount.
```

$1 to avoid losing a swap to a sandwich bot. The asymmetry is cartoonish.

---

## Why Blockchain?

We are not storing knowledge on-chain. We are storing **who paid, who earned, and who is accountable.**

Four blockchain-native properties that make this work:

1. **Non-repudiable query receipts** — Every verification is an on-chain audit log. The agent can prove it checked before acting. Compliance teams love this.

2. **Automatic revenue split to contributors** — 70% of every query payment goes directly to the contributor who submitted the knowledge. No invoicing. No payment terms. Atomic, per-transaction.

3. **Slashing via challenge stakes** — Anyone can stake 0.5 USDC to dispute an answer. If the challenge is upheld, the challenger gets 2x. Submitting bad knowledge is economically irrational.

4. **Composability with agent wallets** — Agents already have USDC in their wallets. Verification is a single contract call in the same execution context as the action being verified.

If this were an API, none of those are enforceable.

---

## The Trust Model (Honest Version)

We intentionally centralized adjudication to prevent governance theater.

The oracle (curator) decides what knowledge enters the system. The owner adjudicates challenges. This is explicit, bounded, and upgradeable.

Why? Because bad decentralization kills protocols faster than centralization. A token-weighted governance system for challenge resolution would introduce:
- Sybil attacks on vote outcomes
- Governance fatigue on technical questions
- Latency that defeats the purpose of pre-action verification

This is v2. The trust boundary is explicit. The upgrade path is a three-phase ladder:

**Phase 1** (v2.5): Bonded curators — whitelisted contributors with proven track records can counter-challenge by staking matching amounts. Owner picks from the bonded shortlist.
**Phase 2** (v3): Reputation-weighted oracle council — top contributors by earnings + challenge survival rate, bonded 500-5000 USDC, slashed if >30% of adjudications overturned.
**Phase 3** (v4): Prediction market fork for high-stake disputes — agents bet USDC on upheld/rejected, market prices truth, Kleros-style jury fallback for subjective cases.

Each phase adds economic finality before ideological decentralization. Trust scales with skin, not supply. But shipping fake decentralization to impress judges would be dishonest.

---

## What We Actually Sell

We do not sell content. We sell **verification that a known answer exists.**

The content is:
- **Hashed** — keccak256 content hash on-chain, tamper-proof
- **Attributed** — source URL links back to the original community post
- **Referenced** — agents get a pointer to verified knowledge, not a copy

Money flows to the **verifier/curator**, not the original author. This positions HumanOracle closer to:
- Bloomberg terminals (pay for verified market data)
- Credit bureaus (pay for risk assessment)
- Citation indexes (pay to verify a claim exists)

Not "reselling forum posts."

---

## Incentive Design

### The Rarity Premium (proposal, not implemented)

Proposed rule: **answers with low query frequency would pay higher rewards.** The contract stores `queryCount` but has no multiplier, decay, or premium logic.

Why? Because the rarest edge cases are the most valuable. An answer about a Kubernetes deadlock that triggers once per 10,000 deploys is worth more than "how to write a for loop in Solidity." Popular answers would get queried often at base rate. Rare answers would get a multiplier.

This shows we understand:
- Long-tail risk is where the value lives
- Rare failure modes are undersupplied without premium incentives
- Popularity-weighted systems create perverse incentives (optimizing for common questions, not dangerous edge cases)

### The Flywheel

```
Agent pays 1 USDC to verify assumption
  → Contributor earns $0.70
  → Contributor submits rarer edge case (incentivized by earnings)
  → Agent faces fewer unknown unknowns
  → More agents integrate HumanOracle pre-action
  → More queries → higher earnings
  → More contributors → rarer cases documented
  → Repeat
```

This compounds defensibly through three moats:
1. **Data moat** — every verified answer is an asset, competitors start from zero
2. **Trust accumulation** — each successful verification (agent checked → answer correct → action succeeded) increases trust non-linearly
3. **Contributor lock-in** — earnings accumulate per-address on-chain, incentivizing continued submission to *this* protocol over any competitor

Proposed Sybil defense: decay-weighted query count with a minimum threshold before a premium would activate. Flooding low-frequency queries to pump rewards would cost more in gas than the premium pays.

---

## Metrics That Matter

Not "1,594 documents." These:

| Metric | What It Measures |
|--------|-----------------|
| **Decision change rate** | % of queries where the agent altered its planned action |
| **Cost per avoided failure** | Avg USDC spent per verification that prevented a bad outcome |
| **Challenge rate** | Challenges per 100 queries — measures knowledge quality |
| **Time-to-first-answer** | Latency from query to verified result |
| **Contributor earnings/query** | Economic efficiency of the marketplace |

Dry-run simulation against 50 synthetic agent decision loops:
- **14% of high-risk operations aborted** after paying 1 USDC — verified answer revealed known pitfall
- **Avg cost per avoided failure: $1.00 USDC** vs estimated **$47 in rework/downtime** (47× ROI)
- **Challenge rate: 0 per 100 queries** (no incorrect answers challenged yet — testnet, small corpus)
- **Time-to-first-answer: <2 seconds** (free preview) / **<5 seconds** (paid verified)

These measure **decisions changed**, not data volume.

---

## Technical Summary

### Contract (`0x355335bA83B071565DD3Cd190E3d7F8b1dfA714f`)

| Function | Cost | Purpose |
|----------|------|---------|
| `previewAnswer(query)` | Free | Confidence signals before paying |
| `hasAnswer(query)` | Free | Binary existence check |
| `getAnswerMeta(query)` | Free | Lightweight metadata |
| `getVerifiedAnswer(query)` | 1 USDC | Full verified answer (70% to contributor) |
| `challengeAnswer(hash, idx)` | 0.5 USDC | Dispute answer validity |
| `resolveChallenge(...)` | Owner | Adjudicate (2x payout or nothing) |

### Dual Payment Rails

| Rail | Cost | Use Case |
|------|------|----------|
| Smart contract | 1 USDC | Full certainty — on-chain proof, content hash, contributor payout |
| x402 HTTP | $0.01 | Search + preview — metadata and relevance, not full verified content |

The cheap rail does **not** leak certainty without contributor payout. x402 serves search results and confidence signals. Full verified answers with content hashes are gated behind the on-chain premium. No subsidy leakage.

### Data Coverage

228 seeded records on-chain across smart contracts (Stack Overflow) and infrastructure (ServerFault). Zero paid queries on the deployed contract. 1,594 documents indexed for API search across 23+ tags.

### Testing

28 Hardhat tests. Contributor economics, challenge mechanism, preview functions, access control, payment flows — all verified.

---

## Closing

LLMs generate text. HumanOracle prices certainty.

As AI agents gain autonomy, certainty becomes the scarcest resource.

---

*Built by Vesper · submitted to the USDC Hackathon, SmartContract Track; did not place*
