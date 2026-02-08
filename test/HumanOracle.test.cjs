const { expect } = require("chai");
const hre = require("hardhat");

describe("HumanOracle", function () {
  let oracle, usdc, owner, user, challenger, contributor;
  const PREMIUM_FEE = 1_000_000n; // 1 USDC (6 decimals)
  const CHALLENGE_FEE = 500_000n; // 0.5 USDC

  beforeEach(async function () {
    [owner, user, challenger, contributor] = await hre.ethers.getSigners();

    const MockERC20 = await hre.ethers.getContractFactory("MockUSDC");
    usdc = await MockERC20.deploy();
    await usdc.waitForDeployment();

    const HumanOracle = await hre.ethers.getContractFactory("HumanOracle");
    oracle = await HumanOracle.deploy(await usdc.getAddress(), owner.address);
    await oracle.waitForDeployment();

    await usdc.mint(user.address, 100_000_000n);
    await usdc.mint(challenger.address, 100_000_000n);
    await usdc.connect(user).approve(await oracle.getAddress(), 100_000_000n);
    await usdc.connect(challenger).approve(await oracle.getAddress(), 100_000_000n);
  });

  describe("Answer Submission", function () {
    it("should submit a single answer", async function () {
      await oracle.submitAnswer(
        "How to prevent reentrancy?",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes("Use ReentrancyGuard")),
        "https://stackoverflow.com/q/12345", 150, true,
        ["solidity", "security"], "How to prevent reentrancy?"
      );
      expect(await oracle.hasAnswer("How to prevent reentrancy?")).to.be.true;
      expect(await oracle.totalAnswers()).to.equal(1);
    });

    it("should submit batch answers", async function () {
      const queries = ["Q1", "Q2", "Q3"];
      const hashes = queries.map(q => hre.ethers.keccak256(hre.ethers.toUtf8Bytes(q)));
      await oracle.submitAnswerBatch(
        queries, hashes,
        queries.map((_, i) => `https://so.com/${i}`),
        [10, 20, 30], [true, false, true],
        [["sol"], ["eth"], ["web3"]], queries
      );
      expect(await oracle.totalAnswers()).to.equal(3);
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
      expect((await oracle.getAnswersByTag("solidity")).length).to.equal(2);
      expect((await oracle.getAnswersByTag("security")).length).to.equal(1);
    });

    it("should track contributor address", async function () {
      await oracle.submitContribution("Q", hre.ethers.keccak256(hre.ethers.toUtf8Bytes("A")),
        "url", 50, true, ["devops"], "Q", contributor.address);
      expect(await oracle.totalAnswers()).to.equal(1);
    });
  });

  describe("Preview (Try Before You Buy)", function () {
    beforeEach(async function () {
      await oracle.submitAnswer("Reentrancy?",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes("Use checks-effects-interactions")),
        "https://so.com/1", 250, true, ["solidity"], "Reentrancy?");
    });

    it("returns confidence signals for existing answer", async function () {
      const [exists, count, topVotes, hasAccepted, tags, title] =
        await oracle.previewAnswer("Reentrancy?");
      expect(exists).to.be.true;
      expect(count).to.equal(1);
      expect(topVotes).to.equal(250);
      expect(hasAccepted).to.be.true;
      expect(tags).to.deep.equal(["solidity"]);
      expect(title).to.equal("Reentrancy?");
    });

    it("returns empty for nonexistent query", async function () {
      const [exists, count] = await oracle.previewAnswer("nonexistent");
      expect(exists).to.be.false;
      expect(count).to.equal(0);
    });

    it("is free (no USDC required)", async function () {
      // User with zero USDC can still preview
      const [exists] = await oracle.connect(challenger).previewAnswer("Reentrancy?");
      expect(exists).to.be.true;
    });

    it("is case-insensitive", async function () {
      const [exists1] = await oracle.previewAnswer("reentrancy?");
      const [exists2] = await oracle.previewAnswer("REENTRANCY?");
      expect(exists1).to.be.true;
      expect(exists2).to.be.true;
    });
  });

  describe("Free Tier (View Functions)", function () {
    beforeEach(async function () {
      await oracle.submitAnswer("Reentrancy?",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes("Use checks-effects-interactions")),
        "https://so.com/1", 250, true, ["solidity"], "Reentrancy?");
    });

    it("hasAnswer works", async function () {
      expect(await oracle.hasAnswer("Reentrancy?")).to.be.true;
      expect(await oracle.hasAnswer("nonexistent")).to.be.false;
    });

    it("getAnswerMeta returns correct metadata", async function () {
      const [count, tags, topVotes] = await oracle.getAnswerMeta("Reentrancy?");
      expect(count).to.equal(1);
      expect(tags).to.deep.equal(["solidity"]);
      expect(topVotes).to.equal(250);
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
    });

    it("should deduct 1 USDC from caller", async function () {
      const before = await usdc.balanceOf(user.address);
      await oracle.connect(user).getVerifiedAnswer("Gas optimization?");
      const after = await usdc.balanceOf(user.address);
      expect(before - after).to.equal(PREMIUM_FEE);
    });

    it("should revert for nonexistent query", async function () {
      await expect(oracle.connect(user).getVerifiedAnswer("nope")).to.be.reverted;
    });
  });

  describe("Contributor Economics", function () {
    beforeEach(async function () {
      // Submit as a specific contributor
      await oracle.submitContribution("K8s OOM?",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes("Check cgroup limits")),
        "https://serverfault.com/1", 300, true, ["kubernetes", "devops"],
        "Why does pod OOM at 3.7GB when limit is 4GB?", contributor.address);
    });

    it("should pay 70% to contributor on query", async function () {
      const before = await usdc.balanceOf(contributor.address);
      await oracle.connect(user).getVerifiedAnswer("K8s OOM?");
      const after = await usdc.balanceOf(contributor.address);
      const expectedPayout = (PREMIUM_FEE * 7000n) / 10000n; // 70%
      expect(after - before).to.equal(expectedPayout);
    });

    it("should track contributor earnings", async function () {
      await oracle.connect(user).getVerifiedAnswer("K8s OOM?");
      const earnings = await oracle.contributorEarnings(contributor.address);
      expect(earnings).to.equal(700_000n); // 0.70 USDC
    });

    it("should track total contributor payouts", async function () {
      await oracle.connect(user).getVerifiedAnswer("K8s OOM?");
      expect(await oracle.totalContributorPayouts()).to.equal(700_000n);
    });

    it("should allow owner to adjust share", async function () {
      await oracle.setContributorShare(8000); // 80%
      await oracle.connect(user).getVerifiedAnswer("K8s OOM?");
      const earnings = await oracle.contributorEarnings(contributor.address);
      expect(earnings).to.equal(800_000n);
    });

    it("should reject invalid share", async function () {
      await expect(oracle.setContributorShare(10001)).to.be.reverted;
    });

    it("should pay oracle-as-contributor when submitted via submitAnswer", async function () {
      // submitAnswer sets contributor = msg.sender (owner/oracle)
      await oracle.submitAnswer("Basic Q",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes("A")),
        "url", 1, true, [], "Basic Q");
      const before = await usdc.balanceOf(owner.address);
      await oracle.connect(user).getVerifiedAnswer("Basic Q");
      const after = await usdc.balanceOf(owner.address);
      // Oracle gets 70% as contributor
      expect(after - before).to.equal(700_000n);
    });
  });

  describe("Challenge Mechanism", function () {
    let queryHash;

    beforeEach(async function () {
      await oracle.submitAnswer("Is Solidity typed?",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes("Yes")),
        "https://so.com/3", 50, true, ["solidity"], "Is Solidity typed?");
      queryHash = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("is solidity typed?"));
    });

    it("should allow challenging an answer", async function () {
      await expect(oracle.connect(challenger).challengeAnswer(queryHash, 0))
        .to.emit(oracle, "AnswerChallenged");
    });

    it("should deduct 0.5 USDC stake", async function () {
      const before = await usdc.balanceOf(challenger.address);
      await oracle.connect(challenger).challengeAnswer(queryHash, 0);
      expect(before - (await usdc.balanceOf(challenger.address))).to.equal(CHALLENGE_FEE);
    });

    it("should pay 2x on upheld challenge", async function () {
      await usdc.mint(await oracle.getAddress(), CHALLENGE_FEE * 2n);
      await oracle.connect(challenger).challengeAnswer(queryHash, 0);
      const before = await usdc.balanceOf(challenger.address);
      await oracle.resolveChallenge(queryHash, 0, 0, true);
      expect((await usdc.balanceOf(challenger.address)) - before).to.equal(CHALLENGE_FEE * 2n);
    });

    it("should keep stake on rejected challenge", async function () {
      await oracle.connect(challenger).challengeAnswer(queryHash, 0);
      const before = await usdc.balanceOf(challenger.address);
      await oracle.resolveChallenge(queryHash, 0, 0, false);
      expect(await usdc.balanceOf(challenger.address)).to.equal(before);
    });

    it("should only allow owner to resolve", async function () {
      await oracle.connect(challenger).challengeAnswer(queryHash, 0);
      await expect(oracle.connect(user).resolveChallenge(queryHash, 0, 0, true)).to.be.reverted;
    });
  });

  describe("Admin Functions", function () {
    it("should allow owner to change oracle", async function () {
      await expect(oracle.setOracle(user.address)).to.emit(oracle, "OracleChanged");
    });

    it("should allow owner to withdraw fees", async function () {
      await oracle.submitAnswer("Q",
        hre.ethers.keccak256(hre.ethers.toUtf8Bytes("A")),
        "url", 1, true, [], "Q");
      await oracle.connect(user).getVerifiedAnswer("Q");
      const before = await usdc.balanceOf(owner.address);
      await oracle.withdrawFees(owner.address);
      // Only 30% remains after 70% contributor payout
      const protocolShare = PREMIUM_FEE - (PREMIUM_FEE * 7000n / 10000n);
      expect((await usdc.balanceOf(owner.address)) - before).to.equal(protocolShare);
    });

    it("should reject non-owner admin calls", async function () {
      await expect(oracle.connect(user).setOracle(user.address)).to.be.reverted;
      await expect(oracle.connect(user).setPremiumFee(0)).to.be.reverted;
      await expect(oracle.connect(user).withdrawFees(user.address)).to.be.reverted;
      await expect(oracle.connect(user).setContributorShare(5000)).to.be.reverted;
    });
  });
});
