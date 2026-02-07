const hre = require("hardhat");

async function main() {
  const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
  const [deployer] = await hre.ethers.getSigners();

  console.log("Deploying HumanOracle with account:", deployer.address);
  console.log("Balance:", hre.ethers.formatEther(await hre.ethers.provider.getBalance(deployer.address)), "ETH");

  const HumanOracle = await hre.ethers.getContractFactory("HumanOracle");
  const oracle = await HumanOracle.deploy(USDC_BASE_SEPOLIA, deployer.address);
  await oracle.waitForDeployment();

  const addr = await oracle.getAddress();
  console.log("\n✅ HumanOracle deployed to:", addr);
  console.log("\nVerify with:");
  console.log(`npx hardhat verify --network baseSepolia ${addr} ${USDC_BASE_SEPOLIA} ${deployer.address}`);

  // Save address for seed script
  const fs = require("fs");
  fs.writeFileSync(".contract-address", addr);
  console.log("\nAddress saved to .contract-address");
}

main().catch((err) => { console.error(err); process.exit(1); });
