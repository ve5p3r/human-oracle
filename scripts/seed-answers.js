const hre = require("hardhat");
const axios = require("axios");
const fs = require("fs");

const SO_API = "https://api.stackexchange.com/2.3/questions";
const TAGS = ["solidity", "ethereum", "web3", "smart-contracts", "blockchain"];
const PER_TAG = 10; // questions per tag
const BATCH_SIZE = 10;

async function fetchQuestions(tag) {
  console.log(`  Fetching top ${PER_TAG} questions tagged [${tag}]...`);
  const { data } = await axios.get(SO_API, {
    params: {
      order: "desc",
      sort: "votes",
      tagged: tag,
      site: "stackoverflow",
      pagesize: PER_TAG,
      filter: "withbody",
    },
    // SO API returns gzip by default
    decompress: true,
  });

  if (data.quota_remaining !== undefined) {
    console.log(`    API quota remaining: ${data.quota_remaining}`);
  }

  return (data.items || []).map((q) => ({
    query: q.title,
    contentHash: hre.ethers.keccak256(hre.ethers.toUtf8Bytes(q.body || q.title)),
    sourceUrl: q.link,
    votes: q.score,
    accepted: q.is_answered && q.accepted_answer_id != null,
    tags: q.tags || [tag],
    questionTitle: q.title,
  }));
}

async function main() {
  const contractAddr = fs.readFileSync(".contract-address", "utf8").trim();
  console.log("Using contract at:", contractAddr);

  const [signer] = await hre.ethers.getSigners();
  const oracle = await hre.ethers.getContractAt("HumanOracle", contractAddr, signer);

  // Deduplicate by query title
  const seen = new Set();
  const allAnswers = [];

  for (const tag of TAGS) {
    try {
      const questions = await fetchQuestions(tag);
      for (const q of questions) {
        const key = q.query.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          allAnswers.push(q);
        }
      }
      // Be nice to SO API
      await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      console.warn(`  ⚠ Failed to fetch [${tag}]:`, err.message);
    }
  }

  console.log(`\nTotal unique questions: ${allAnswers.length}`);

  // Submit in batches
  for (let i = 0; i < allAnswers.length; i += BATCH_SIZE) {
    const batch = allAnswers.slice(i, i + BATCH_SIZE);
    console.log(`\nSubmitting batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} answers)...`);

    const tx = await oracle.submitAnswerBatch(
      batch.map((a) => a.query),
      batch.map((a) => a.contentHash),
      batch.map((a) => a.sourceUrl),
      batch.map((a) => a.votes),
      batch.map((a) => a.accepted),
      batch.map((a) => a.tags),
      batch.map((a) => a.questionTitle)
    );

    const receipt = await tx.wait();
    console.log(`  ✅ tx: ${receipt.hash} (gas: ${receipt.gasUsed})`);
  }

  const total = await oracle.totalAnswers();
  console.log(`\n🎉 Done! Total answers on-chain: ${total}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
