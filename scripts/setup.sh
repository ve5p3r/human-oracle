#!/usr/bin/env bash
# Setup script for HumanOracle
set -euo pipefail

cd "$(dirname "$0")/.."

echo "=== HumanOracle Setup ==="

# Check for .env
if [ ! -f .env ]; then
  echo "Creating .env template..."
  cat > .env << 'EOF'
# Required: your deployer private key (with Base Sepolia ETH)
PRIVATE_KEY=0x...
# Optional: override RPC
RPC_URL=https://sepolia.base.org
EOF
  echo "⚠  Edit .env with your private key before deploying!"
  exit 1
fi

echo "Installing dependencies..."
npm install

echo "Compiling contracts..."
npx hardhat compile

echo ""
echo "✅ Ready! Next steps:"
echo "  npm run deploy    — deploy to Base Sepolia"
echo "  npm run seed      — seed with Stack Overflow data"
