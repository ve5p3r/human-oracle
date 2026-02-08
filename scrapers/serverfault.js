#!/usr/bin/env node
/**
 * ServerFault + DevOps subreddit scraper
 * Targets operational knowledge: infrastructure, sysadmin, edge cases
 */

import axios from 'axios';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const DATA_DIR = join(import.meta.dirname, '..', 'data');

// ServerFault tags — the hard-won operational knowledge
const SF_TAGS = [
  'kubernetes', 'docker', 'nginx', 'linux', 'networking',
  'dns', 'ssl', 'firewall', 'systemd', 'ssh',
  'load-balancing', 'storage', 'monitoring', 'backup', 'ci-cd'
];

const REDDIT_SUBS = [
  { sub: 'devops', sort: 'top', t: 'year', limit: 25 },
  { sub: 'sysadmin', sort: 'top', t: 'year', limit: 25 },
  { sub: 'homelab', sort: 'top', t: 'year', limit: 15 },
  { sub: 'kubernetes', sort: 'top', t: 'year', limit: 20 },
  { sub: 'networking', sort: 'top', t: 'year', limit: 15 },
];

const SE_API = 'https://api.stackexchange.com/2.3/questions';

async function scrapeServerFault() {
  const dir = join(DATA_DIR, 'serverfault');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  let total = 0;
  for (const tag of SF_TAGS) {
    try {
      console.log(`  [SF] Fetching [${tag}]...`);
      const { data } = await axios.get(SE_API, {
        params: {
          order: 'desc', sort: 'votes', tagged: tag,
          site: 'serverfault', pagesize: 20, page: 1,
          filter: 'withbody'
        },
        decompress: true,
      });

      for (const q of (data.items || [])) {
        const filename = `${q.question_id}.md`;
        const tags = (q.tags || []).map(t => `  - ${t}`).join('\n');
        const md = `---
source: serverfault
id: ${q.question_id}
title: "${q.title.replace(/"/g, '\\"')}"
url: ${q.link}
votes: ${q.score}
accepted: ${q.is_answered && q.accepted_answer_id != null}
tags:
${tags}
scraped_at: ${new Date().toISOString()}
---

# ${q.title}

${q.body || '(no body)'}
`;
        await writeFile(join(dir, filename), md);
        total++;
      }
      await new Promise(r => setTimeout(r, 500)); // rate limit
    } catch (err) {
      console.warn(`  ⚠ [SF/${tag}]:`, err.message?.slice(0, 80));
    }
  }
  console.log(`  [SF] Total: ${total} questions`);
  return total;
}

async function scrapeDevOpsReddit() {
  const dir = join(DATA_DIR, 'reddit-devops');
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  let total = 0;
  for (const { sub, sort, t, limit } of REDDIT_SUBS) {
    try {
      console.log(`  [Reddit] Fetching r/${sub}...`);
      const { data } = await axios.get(
        `https://www.reddit.com/r/${sub}/${sort}.json?t=${t}&limit=${limit}`,
        { headers: { 'User-Agent': 'HumanOracle/1.0' } }
      );

      for (const { data: post } of (data?.data?.children || [])) {
        if (!post.selftext || post.selftext.length < 50) continue;
        const filename = `${post.id}.md`;
        const md = `---
source: reddit
subreddit: ${sub}
id: ${post.id}
title: "${post.title.replace(/"/g, '\\"')}"
url: https://reddit.com${post.permalink}
votes: ${post.score}
comments: ${post.num_comments}
scraped_at: ${new Date().toISOString()}
---

# ${post.title}

${post.selftext}
`;
        await writeFile(join(dir, filename), md);
        total++;
      }
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.warn(`  ⚠ [Reddit/${sub}]:`, err.message?.slice(0, 80));
    }
  }
  console.log(`  [Reddit DevOps] Total: ${total} posts`);
  return total;
}

async function main() {
  console.log('🔧 Scraping operational knowledge...\n');
  const sf = await scrapeServerFault();
  const rd = await scrapeDevOpsReddit();
  console.log(`\n✅ Total new documents: ${sf + rd}`);
  console.log('Run ingest.sh to index into QMD');
}

main().catch(console.error);
