require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: { viaIR: true, optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    baseSepolia: {
      url: process.env.RPC_URL || "https://sepolia.base.org",
      chainId: 84532,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      baseSepolia: process.env.BASESCAN_API_KEY || ""
    }
  },
  sourcify: {
    enabled: true
  }
};
