const hre = require("hardhat");

async function main() {
  const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

  // Support deploying via PRIVATE_KEY in .env or hardhat default accounts
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    console.error("❌ No deployer account found.");
    console.error("   Set PRIVATE_KEY in .env to a funded Base Sepolia wallet.");
    console.error("   Example: PRIVATE_KEY=0xabc123...");
    process.exit(1);
  }

  console.log("┌─────────────────────────────────────────────┐");
  console.log("│         HumanOracle Deployment               │");
  console.log("└─────────────────────────────────────────────┘");
  console.log();
  console.log("  Network:  Base Sepolia (84532)");
  console.log("  Deployer:", deployer.address);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const balEth = hre.ethers.formatEther(balance);
  console.log("  Balance: ", balEth, "ETH");

  if (balance === 0n) {
    console.error("\n❌ Deployer has 0 ETH. Fund it first:");
    console.error("   - Faucet: https://www.alchemy.com/faucets/base-sepolia");
    console.error("   - Or transfer from another funded wallet");
    process.exit(1);
  }

  console.log("\n  Deploying HumanOracle...");
  const HumanOracle = await hre.ethers.getContractFactory("HumanOracle");
  const oracle = await HumanOracle.deploy(USDC_BASE_SEPOLIA, deployer.address);
  await oracle.waitForDeployment();

  const addr = await oracle.getAddress();
  console.log("\n  ✅ HumanOracle deployed to:", addr);
  console.log("\n  Verify with:");
  console.log(`  npx hardhat verify --network baseSepolia ${addr} ${USDC_BASE_SEPOLIA} ${deployer.address}`);

  // Save address for seed script
  const fs = require("fs");
  fs.writeFileSync(".contract-address", addr);
  console.log("\n  Address saved to .contract-address");

  // Print summary
  console.log("\n┌─────────────────────────────────────────────┐");
  console.log("│  Next steps:                                 │");
  console.log("│  1. npm run seed   — seed on-chain answers   │");
  console.log("│  2. npm start      — start REST API          │");
  console.log("└─────────────────────────────────────────────┘");
}

main().catch((err) => { console.error(err); process.exit(1); });
