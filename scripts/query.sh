#!/usr/bin/env bash
# Query the HumanOracle contract using cast (foundry)
# Usage: ./query.sh "How to send ETH in Solidity?"

set -euo pipefail

CONTRACT="${HUMAN_ORACLE_ADDRESS:?Set HUMAN_ORACLE_ADDRESS}"
RPC="https://sepolia.base.org"

QUERY="${1:?Usage: query.sh <question>}"

echo "=== HumanOracle Query ==="
echo "Question: $QUERY"
echo ""

# Free: check if answer exists
echo "--- hasAnswer (free) ---"
cast call "$CONTRACT" "hasAnswer(string)(bool)" "$QUERY" --rpc-url "$RPC"

# Free: get metadata
echo ""
echo "--- getAnswerMeta (free) ---"
cast call "$CONTRACT" "getAnswerMeta(string)(uint256,string[],uint256)" "$QUERY" --rpc-url "$RPC"

# Premium query (requires USDC approval first):
# cast send $USDC "approve(address,uint256)" $CONTRACT 1000000 --rpc-url $RPC --private-key $PK
# cast send $CONTRACT "getVerifiedAnswer(string)" "$QUERY" --rpc-url $RPC --private-key $PK
echo ""
echo "For premium query, approve 1 USDC first then call getVerifiedAnswer()"
