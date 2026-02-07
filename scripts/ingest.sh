#!/usr/bin/env bash
# HumanOracle Ingestion Pipeline
# Scrapes data, indexes into QMD, builds vector embeddings

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
QMD="${QMD_PATH:-/home/jack/.bun/bin/qmd}"
DATA_DIR="$PROJECT_DIR/data"

log() { echo "[ingest] $(date -Iseconds) $*"; }

log "=== HumanOracle Ingestion Pipeline ==="
log "Project: $PROJECT_DIR"
log "Data:    $DATA_DIR"
log "QMD:     $QMD"

# Step 1: Run scrapers
log ""
log "--- Step 1: Scraping Stack Overflow ---"
node "$PROJECT_DIR/scrapers/stackoverflow.js" || log "⚠ SO scraper had errors (continuing)"

log ""
log "--- Step 2: Scraping Reddit ---"
node "$PROJECT_DIR/scrapers/reddit.js" || log "⚠ Reddit scraper had errors (continuing)"

# Step 3: Count what we have
SO_COUNT=$(find "$DATA_DIR/stackoverflow" -name "*.md" 2>/dev/null | wc -l || echo 0)
REDDIT_COUNT=$(find "$DATA_DIR/reddit" -name "*.md" 2>/dev/null | wc -l || echo 0)
TOTAL=$((SO_COUNT + REDDIT_COUNT))

log ""
log "--- Step 3: Data Summary ---"
log "Stack Overflow: $SO_COUNT files"
log "Reddit:         $REDDIT_COUNT files"
log "Total:          $TOTAL files"

if [ "$TOTAL" -eq 0 ]; then
  log "⚠ No data files found. Exiting."
  exit 1
fi

# Step 4: Index into QMD
log ""
log "--- Step 4: Indexing into QMD ---"

# Remove existing collection if present, then re-add
$QMD collection remove "$COLLECTION_NAME" 2>/dev/null || true

COLLECTION_NAME="human-oracle"
$QMD collection add "$DATA_DIR" --name "$COLLECTION_NAME" --mask "**/*.md"

log "Collection '$COLLECTION_NAME' created/updated"

# Step 5: Build vector embeddings
log ""
log "--- Step 5: Building Vector Embeddings ---"
$QMD embed || log "⚠ Embedding failed (search will use BM25 only)"

# Step 6: Verify
log ""
log "--- Step 6: Verification ---"
$QMD status
$QMD collection list

log ""
log "=== Ingestion Complete ==="
log "Test with: $QMD search 'how to send ETH in Solidity'"
