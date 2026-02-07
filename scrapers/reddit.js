#!/usr/bin/env node
// Reddit Scraper — fetches top posts from Web3/Solidity subreddits
// Uses public JSON API (no auth). Outputs markdown to data/reddit/

import axios from 'axios';
import { writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const OUTPUT_DIR = join(import.meta.dirname, '..', 'data', 'reddit');
const SUBREDDITS = ['solidity', 'ethereum', 'ethdev', 'cryptocurrency'];
const SORT_OPTIONS = ['top', 'hot'];
const TIME_FILTER = 'all'; // for top sort
const LIMIT = 100;
const RATE_DELAY_MS = 2000; // Reddit is aggressive with rate limits on .json

const log = (msg) => console.log(`[Reddit] ${new Date().toISOString()} ${msg}`);
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function decodeHtml(text) {
  if (!text) return '';
  return text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function postToMarkdown(post, comments) {
  const created = new Date(post.created_utc * 1000).toISOString();
  const title = (post.title || '').replace(/"/g, '\\"');
  const selftext = decodeHtml(post.selftext || '');
  const url = `https://reddit.com${post.permalink}`;

  let md = `---
title: "${title}"
url: "${url}"
source: reddit
post_id: "${post.id}"
score: ${post.score}
subreddit: "${post.subreddit}"
author: "${post.author}"
num_comments: ${post.num_comments}
created: "${created}"
---

# ${decodeHtml(post.title)}

${selftext}
`;

  if (comments.length > 0) {
    md += '\n---\n\n## Top Comments\n';
    for (const c of comments) {
      const body = decodeHtml(c.body || '');
      if (!body || body === '[deleted]' || body === '[removed]') continue;
      md += `\n### u/${c.author} (${c.score} points)\n\n${body}\n`;
    }
  }

  return md;
}

async function fetchSubreddit(subreddit, sort, after = null) {
  const url = `https://www.reddit.com/r/${subreddit}/${sort}.json`;
  const params = { limit: LIMIT, raw_json: 1 };
  if (sort === 'top') params.t = TIME_FILTER;
  if (after) params.after = after;

  const { data } = await axios.get(url, {
    params,
    headers: { 'User-Agent': 'HumanOracle/1.0 (research scraper)' },
    timeout: 15000,
  });
  return data?.data || {};
}

async function fetchComments(subreddit, postId) {
  try {
    const url = `https://www.reddit.com/r/${subreddit}/comments/${postId}.json`;
    const { data } = await axios.get(url, {
      params: { limit: 10, sort: 'top', raw_json: 1 },
      headers: { 'User-Agent': 'HumanOracle/1.0 (research scraper)' },
      timeout: 15000,
    });
    if (!Array.isArray(data) || data.length < 2) return [];
    const commentListing = data[1]?.data?.children || [];
    return commentListing
      .filter(c => c.kind === 't1' && c.data?.body)
      .map(c => c.data)
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function getExistingIds() {
  if (!existsSync(OUTPUT_DIR)) return new Set();
  const files = await readdir(OUTPUT_DIR);
  return new Set(files.map(f => f.replace('.md', '')));
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const existingIds = await getExistingIds();
  let totalNew = 0;

  log(`Starting scrape. ${existingIds.size} existing files.`);

  for (const sub of SUBREDDITS) {
    for (const sort of SORT_OPTIONS) {
      log(`Scraping r/${sub} (${sort})`);
      try {
        await sleep(RATE_DELAY_MS);
        const listing = await fetchSubreddit(sub, sort);
        const posts = (listing.children || [])
          .filter(c => c.kind === 't3')
          .map(c => c.data)
          .filter(p => !p.is_video && p.selftext !== undefined);

        let newCount = 0;
        for (const post of posts) {
          if (existingIds.has(post.id)) continue;
          // Only keep text posts with some content or high score
          if (!post.selftext && post.score < 50) continue;

          await sleep(RATE_DELAY_MS);
          const comments = await fetchComments(sub, post.id);
          const md = postToMarkdown(post, comments);
          await writeFile(join(OUTPUT_DIR, `${post.id}.md`), md, 'utf-8');
          existingIds.add(post.id);
          newCount++;
          totalNew++;
        }

        log(`  ${sort}: ${newCount} new posts written from ${posts.length} total`);
      } catch (err) {
        if (err.response?.status === 429) {
          log(`  Rate limited on r/${sub}/${sort}, waiting 30s...`);
          await sleep(30000);
        } else {
          log(`  Error: ${err.message}`);
        }
      }
    }
  }

  log(`Done. ${totalNew} new files written. Total: ${existingIds.size}`);
}

main().catch(err => { console.error(err); process.exit(1); });
