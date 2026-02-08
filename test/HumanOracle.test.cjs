const { expect } = require("chai");
const hre = require("hardhat");

describe("HumanOracle", function () {
  let oracle, usdc, owner, user, challenger;
  const PREMIUM_FEE = 1_000_000n; // 1 USDC (6 decimals)
  const CHALLENGE_FEE = 500_000n; // 0.5 USDC

  beforeEach(async function () {
    [owner, user, challenger] = await hre.ethers.getSigners();

    // Deploy mock USDC (ERC20)
    const MockERC20 = await hre.ethers.getContractFactory("MockUSDC");
    usdc = await MockERC20.deploy();
    await usdc.waitForDeployment();

    // Deploy HumanOracle
    const HumanOracle = await hre.ethers.getContractFactory("HumanOracle");
    oracle = await HumanOracle.deploy(await usdc.getAddress(), owner.address);
    await oracle.waitForDeployment();

    // Fund user and challenger with USDC
    await usdc.mint(user.address, 100_000_000n);
    await usdc.mint(challenger.address, 100_000_000n);
    // Approve oracle to spend
    await usdc.connect(user).approve(await oracle.getAddress(), 100_000_000n);
    await usdc.connect(challenger).approve(await oracle.getAddress(), 100_000_000n);
  });

  describe("Answer Submission", function () {
    it("should submit a single answer", async function () {
      await oracle.submitAnswer(
        "How to prevent reentrancy?",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes("Use ReentrancyGuard")),
        "https://stackoverflow.com/q/12345",
        150, true,
        ["solidity", "security"],
        "How to prevent reentrancy?"
      );
      expect(await oracle.hasAnswer("How to prevent reentrancy?")).to.be.true;
      expect(await oracle.totalAnswers()).to.equal(1);
    });

    it("should submit batch answers", async function () {
      const queries = ["Q1", "Q2", "Q3"];
      const hashes = queries.map(q => hre.ethers.keccak256(hre.ethers.toUtf8Bytes(q)));
      const urls = queries.map((_, i) => `https://so.com/${i}`);
      const votes = [10, 20, 30];
      const accepted = [true, false, true];
      const tags = [["sol"], ["eth"], ["web3"]];
      const titles = queries;

      await oracle.submitAnswerBatch(queries, hashes, urls, votes, accepted, tags, titles);
      expect(await oracle.totalAnswers()).to.equal(3);
      expect(await oracle.hasAnswer("Q1")).to.be.true;
      expect(await oracle.hasAnswer("Q2")).to.be.true;
      expect(await oracle.hasAnswer("Q3")).to.be.true;
    });

    it("should reject non-oracle submissions", async function () {
      await expect(
        oracle.connect(user).submitAnswer("Q", hre.ethers.ZeroHash, "url", 0, false, [], "Q")
      ).to.be.reverted;
    });

    it("should track answers by tag", async function () {
      await oracle.submitAnswer("Q1", hre.ethers.keccak256(hre.ethers.toUtf8Bytes("A1")),
        "url1", 10, true, ["solidity", "security"], "Q1");
      await oracle.submitAnswer("Q2", hre.ethers.keccak256(hre.ethers.toUtf8Bytes("A2")),
        "url2", 20, false, ["solidity"], "Q2");

      const solidityAnswers = await oracle.getAnswersByTag("solidity");
      expect(solidityAnswers.length).to.equal(2);
      const securityAnswers = await oracle.getAnswersByTag("security");
      expect(securityAnswers.length).to.equal(1);
    });
  });

  describe("Free Tier (View Functions)", function () {
    beforeEach(async function () {
      await oracle.submitAnswer("Reentrancy?",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes("Use checks-effects-interactions")),
        "https://so.com/1", 250, true, ["solidity"], "Reentrancy?");
    });

    it("hasAnswer returns true for existing", async function () {
      expect(await oracle.hasAnswer("Reentrancy?")).to.be.true;
    });

    it("hasAnswer returns false for missing", async function () {
      expect(await oracle.hasAnswer("nonexistent query")).to.be.false;
    });

    it("getAnswerMeta returns correct metadata", async function () {
      const [count, tags, topVotes] = await oracle.getAnswerMeta("Reentrancy?");
      expect(count).to.equal(1);
      expect(tags).to.deep.equal(["solidity"]);
      expect(topVotes).to.equal(250);
    });

    it("is case-insensitive", async function () {
      expect(await oracle.hasAnswer("reentrancy?")).to.be.true;
      expect(await oracle.hasAnswer("REENTRANCY?")).to.be.true;
    });
  });

  describe("Premium Tier (USDC Payment)", function () {
    beforeEach(async function () {
      await oracle.submitAnswer("Gas optimization?",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes("Use uint256 packing")),
        "https://so.com/2", 100, true, ["gas"], "Gas optimization?");
    });

    it("should return verified answer on payment", async function () {
      const result = await oracle.connect(user).getVerifiedAnswer.staticCall("Gas optimization?");
      expect(result.sourceUrl).to.equal("https://so.com/2");
      expect(result.votes).to.equal(100);
      expect(result.accepted).to.be.true;
    });

    it("should deduct 1 USDC from caller", async function () {
      const before = await usdc.balanceOf(user.address);
      await oracle.connect(user).getVerifiedAnswer("Gas optimization?");
      const after = await usdc.balanceOf(user.address);
      expect(before - after).to.equal(PREMIUM_FEE);
    });

    it("should revert for nonexistent query", async function () {
      await expect(
        oracle.connect(user).getVerifiedAnswer("doesn't exist")
      ).to.be.reverted;
    });
  });

  describe("Challenge Mechanism", function () {
    let queryHash;

    beforeEach(async function () {
      await oracle.submitAnswer("Is Solidity typed?",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes("Yes, statically typed")),
        "https://so.com/3", 50, true, ["solidity"], "Is Solidity typed?");
      queryHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(
        "is solidity typed?" // normalized (lowercase)
      ));
    });

    it("should allow challenging an answer", async function () {
      await expect(oracle.connect(challenger).challengeAnswer(queryHash, 0))
        .to.emit(oracle, "AnswerChallenged");
    });

    it("should deduct 0.5 USDC stake", async function () {
      const before = await usdc.balanceOf(challenger.address);
      await oracle.connect(challenger).challengeAnswer(queryHash, 0);
      const after = await usdc.balanceOf(challenger.address);
      expect(before - after).to.equal(CHALLENGE_FEE);
    });

    it("should pay 2x on upheld challenge", async function () {
      // Fund contract so it can pay 2x
      await usdc.mint(await oracle.getAddress(), CHALLENGE_FEE * 2n);
      await oracle.connect(challenger).challengeAnswer(queryHash, 0);
      const before = await usdc.balanceOf(challenger.address);
      await oracle.resolveChallenge(queryHash, 0, 0, true);
      const after = await usdc.balanceOf(challenger.address);
      expect(after - before).to.equal(CHALLENGE_FEE * 2n);
    });

    it("should keep stake on rejected challenge", async function () {
      await oracle.connect(challenger).challengeAnswer(queryHash, 0);
      const before = await usdc.balanceOf(challenger.address);
      await oracle.resolveChallenge(queryHash, 0, 0, false);
      const after = await usdc.balanceOf(challenger.address);
      expect(after).to.equal(before); // no payout
    });

    it("should only allow owner to resolve", async function () {
      await oracle.connect(challenger).challengeAnswer(queryHash, 0);
      await expect(
        oracle.connect(user).resolveChallenge(queryHash, 0, 0, true)
      ).to.be.reverted;
    });
  });

  describe("Admin Functions", function () {
    it("should allow owner to change oracle", async function () {
      await expect(oracle.setOracle(user.address))
        .to.emit(oracle, "OracleChanged");
    });

    it("should allow owner to withdraw fees", async function () {
      // Generate fees first
      await oracle.submitAnswer("Q",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes("A")),
        "url", 1, true, [], "Q");
      await oracle.connect(user).getVerifiedAnswer("Q");

      const before = await usdc.balanceOf(owner.address);
      await oracle.withdrawFees(owner.address);
      const after = await usdc.balanceOf(owner.address);
      expect(after - before).to.equal(PREMIUM_FEE);
    });

    it("should reject non-owner admin calls", async function () {
      await expect(oracle.connect(user).setOracle(user.address)).to.be.reverted;
      await expect(oracle.connect(user).setPremiumFee(0)).to.be.reverted;
      await expect(oracle.connect(user).withdrawFees(user.address)).to.be.reverted;
    });
  });
});
