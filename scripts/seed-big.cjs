const hre = require("hardhat");
const axios = require("axios");
const fs = require("fs");

const SO_API = "https://api.stackexchange.com/2.3/questions";
const TAGS = ["solidity", "ethereum", "web3", "smart-contracts", "blockchain", "defi", "erc20", "nft", "ethers.js", "hardhat", "truffle", "openzeppelin", "metamask", "gas", "abi"];
const PER_TAG = 30;
const BATCH_SIZE = 15;

async function fetchQuestions(tag, page = 1) {
  const { data } = await axios.get(SO_API, {
    params: { order: "desc", sort: "votes", tagged: tag, site: "stackoverflow", pagesize: PER_TAG, page, filter: "withbody" },
    decompress: true,
  });
  return (data.items || []).map((q) => ({
    query: q.title,
    contentHash: hre.ethers.keccak256(hre.ethers.toUtf8Bytes(q.body || q.title)),
    sourceUrl: q.link,
    votes: q.score,
    accepted: q.is_answered && q.accepted_answer_id != null,
    tags: (q.tags || [tag]).slice(0, 5),
    questionTitle: q.title,
  }));
}

async function main() {
  const contractAddr = fs.readFileSync(".contract-address", "utf8").trim();
  const [signer] = await hre.ethers.getSigners();
  const oracle = await hre.ethers.getContractAt("HumanOracle", contractAddr, signer);

  const seen = new Set();
  const allAnswers = [];

  for (const tag of TAGS) {
    try {
      console.log(`  Fetching [${tag}]...`);
      const questions = await fetchQuestions(tag);
      for (const q of questions) {
        const key = q.query.toLowerCase();
        if (!seen.has(key)) { seen.add(key); allAnswers.push(q); }
      }
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.warn(`  ⚠ [${tag}]:`, err.message);
    }
  }

  console.log(`\nTotal unique: ${allAnswers.length}`);
  let submitted = 0;

  for (let i = 0; i < allAnswers.length; i += BATCH_SIZE) {
    const batch = allAnswers.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    try {
      console.log(`Batch ${batchNum} (${batch.length})...`);
      const tx = await oracle.submitAnswerBatch(
        batch.map((a) => a.query), batch.map((a) => a.contentHash),
        batch.map((a) => a.sourceUrl), batch.map((a) => a.votes),
        batch.map((a) => a.accepted), batch.map((a) => a.tags),
        batch.map((a) => a.questionTitle)
      );
      const r = await tx.wait();
      submitted += batch.length;
      console.log(`  ✅ +${batch.length} (gas: ${r.gasUsed})`);
    } catch (err) {
      console.warn(`  ⚠ batch ${batchNum}:`, err.message?.slice(0, 100));
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  const total = await oracle.totalAnswers();
  console.log(`\n🎉 Submitted ${submitted} this run. Total on-chain: ${total}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
