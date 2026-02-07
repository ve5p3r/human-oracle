# HumanOracle — Verified Human Knowledge Oracle

## What This Is

An on-chain oracle + REST API for verified Stack Overflow and Reddit answers about Solidity, Ethereum, and Web3. Query verified human knowledge instead of hallucinating.

## Network

- **Chain**: Base Sepolia (84532)
- **USDC**: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- **API**: `http://localhost:3847`

## Full Pipeline

```bash
# 1. Scrape → Index → Embed (one command)
npm run ingest

# 2. Start API
npm start
```

### Pipeline stages:
```
Stack Overflow API ─┐                QMD Collection
(8 tags, 300+/tag)  ├─▶ Markdown ──▶ (BM25 + vectors) ──▶ REST API :3847
Reddit JSON API ────┘    files        SQLite-backed         ──▶ Smart Contract
(4 subreddits)
```

## REST API Endpoints

### Health Check
```bash
curl http://localhost:3847/health
# {"status":"ok","service":"human-oracle","uptime":42}
```

### Search (Free)
```bash
# BM25 keyword search (fast)
curl "http://localhost:3847/search?q=reentrancy+guard&n=5"

# Vector semantic search
curl "http://localhost:3847/search?q=how+to+safely+transfer+tokens&n=5&mode=vsearch"

# Combined with LLM reranking
curl "http://localhost:3847/search?q=ERC721+callback+pitfalls&n=3&mode=query"
```

### Get Specific Answer
```bash
# Stack Overflow answer
curl http://localhost:3847/answer/stackoverflow/12345678

# Reddit post
curl http://localhost:3847/answer/reddit/abc123
```

### List Tags
```bash
curl http://localhost:3847/tags
# {"tags":[{"tag":"solidity","count":450},{"tag":"ethereum","count":320},...]}
```

### Collection Stats
```bash
curl http://localhost:3847/stats
# {"total_documents":1200,"sources":{"stackoverflow":900,"reddit":300},...}
```

### Premium Search (with LLM reranking)
```bash
curl -X POST http://localhost:3847/premium/search \
  -H "Content-Type: application/json" \
  -d '{"query": "delegate call security implications", "n": 3}'
```

## On-Chain Queries

### Free: Check if answer exists
```bash
cast call $HUMAN_ORACLE_ADDRESS "hasAnswer(string)(bool)" "How to send ETH in Solidity?" --rpc-url https://sepolia.base.org
```

### Free: Get metadata
```bash
cast call $HUMAN_ORACLE_ADDRESS "getAnswerMeta(string)(uint256,string[],uint256)" "How to send ETH in Solidity?" --rpc-url https://sepolia.base.org
```

### Free: Browse by tag
```bash
cast call $HUMAN_ORACLE_ADDRESS "getAnswersByTag(string)(bytes32[])" "solidity" --rpc-url https://sepolia.base.org
```

### Premium (1 USDC): Full verified answer
```bash
# Approve USDC spend
cast send 0x036CbD53842c5426634e7929541eC2318f3dCF7e "approve(address,uint256)" $HUMAN_ORACLE_ADDRESS 1000000 --rpc-url https://sepolia.base.org --private-key $PK

# Query
cast send $HUMAN_ORACLE_ADDRESS "getVerifiedAnswer(string)" "How to send ETH in Solidity?" --rpc-url https://sepolia.base.org --private-key $PK
```

## When To Use This

- Writing Solidity and want to check for known pitfalls
- User asks a niche technical question about Ethereum/Web3
- Need a verified source, not training data
- Want to verify an answer hash against on-chain record

## Tags Available

`solidity`, `ethereum`, `web3`, `smart-contracts`, `blockchain`, `defi`, `erc20`, `nft`, `r/solidity`, `r/ethereum`, `r/ethdev`, `r/cryptocurrency`
