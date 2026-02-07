#!/usr/bin/env node
// Stack Overflow Scraper — fetches top questions+answers for Web3/Solidity tags
// Outputs markdown files to data/stackoverflow/ for QMD indexing

import axios from 'axios';
import { writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

const BASE_URL = 'https://api.stackexchange.com/2.3';
const OUTPUT_DIR = join(import.meta.dirname, '..', 'data', 'stackoverflow');
const TAGS = ['solidity', 'ethereum', 'web3', 'smart-contracts', 'blockchain', 'defi', 'erc20', 'nft'];
const PAGE_SIZE = 100;
const MAX_PAGES = 3; // per tag
const RATE_DELAY_MS = 40; // ~25 req/sec to stay under 30

const log = (msg) => console.log(`[SO] ${new Date().toISOString()} ${msg}`);

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function decodeHtml(html) {
  if (!html) return '';
  return html
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));
}

function stripHtml(html) {
  if (!html) return '';
  return decodeHtml(html)
    .replace(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) => '\n```\n' + decodeHtml(code).trim() + '\n```\n')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li>/gi, '- ').replace(/<\/li>/gi, '\n')
    .replace(/<p>/gi, '\n').replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function questionToMarkdown(q, answers) {
  const tags = (q.tags || []).join(', ');
  const created = new Date(q.creation_date * 1000).toISOString();
  const accepted = answers.some(a => a.is_accepted) ? 'true' : 'false';
  const title = decodeHtml(q.title).replace(/"/g, '\\"');

  let md = `---
title: "${title}"
url: "https://stackoverflow.com/questions/${q.question_id}"
source: stackoverflow
question_id: ${q.question_id}
votes: ${q.score}
accepted: ${accepted}
tags: [${tags}]
answer_count: ${q.answer_count}
views: ${q.view_count}
created: "${created}"
---

# ${decodeHtml(q.title)}

${stripHtml(q.body)}
`;

  if (answers.length > 0) {
    md += '\n---\n\n## Answers\n';
    const sorted = [...answers].sort((a, b) => b.score - a.score);
    for (const a of sorted) {
      const badge = a.is_accepted ? ' ✅ Accepted' : '';
      md += `\n### Answer (${a.score} votes${badge})\n\n${stripHtml(a.body)}\n`;
    }
  }

  return md;
}

async function fetchQuestions(tag, page = 1) {
  const url = `${BASE_URL}/questions`;
  const params = {
    order: 'desc', sort: 'votes', tagged: tag, site: 'stackoverflow',
    pagesize: PAGE_SIZE, page, filter: 'withbody',
  };
  const { data } = await axios.get(url, { params });
  return data;
}

async function fetchAnswers(questionIds) {
  if (questionIds.length === 0) return [];
  const ids = questionIds.join(';');
  const url = `${BASE_URL}/questions/${ids}/answers`;
  const params = {
    order: 'desc', sort: 'votes', site: 'stackoverflow',
    pagesize: 100, filter: 'withbody',
  };
  const { data } = await axios.get(url, { params });
  return data.items || [];
}

async function getExistingIds() {
  if (!existsSync(OUTPUT_DIR)) return new Set();
  const files = await readdir(OUTPUT_DIR);
  return new Set(files.map(f => f.replace('.md', '')).filter(f => /^\d+$/.test(f)));
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const existingIds = await getExistingIds();
  let totalNew = 0, totalSkipped = 0;

  log(`Starting scrape. ${existingIds.size} existing files. Tags: ${TAGS.join(', ')}`);

  for (const tag of TAGS) {
    log(`Scraping tag: ${tag}`);

    for (let page = 1; page <= MAX_PAGES; page++) {
      try {
        await sleep(RATE_DELAY_MS);
        const data = await fetchQuestions(tag, page);
        const questions = data.items || [];

        if (questions.length === 0) break;

        // Filter out already-scraped
        const newQuestions = questions.filter(q => !existingIds.has(String(q.question_id)));
        const skipped = questions.length - newQuestions.length;
        totalSkipped += skipped;

        if (newQuestions.length === 0) {
          log(`  Page ${page}: all ${questions.length} already exist, skipping`);
          if (!data.has_more) break;
          continue;
        }

        // Fetch answers in batches of 30 (API limit on semicolon-separated IDs)
        const allAnswers = [];
        for (let i = 0; i < newQuestions.length; i += 30) {
          await sleep(RATE_DELAY_MS);
          const batch = newQuestions.slice(i, i + 30).map(q => q.question_id);
          const answers = await fetchAnswers(batch);
          allAnswers.push(...answers);
        }

        // Group answers by question
        const answerMap = {};
        for (const a of allAnswers) {
          (answerMap[a.question_id] ||= []).push(a);
        }

        // Write markdown files
        for (const q of newQuestions) {
          const answers = answerMap[q.question_id] || [];
          const md = questionToMarkdown(q, answers);
          const filePath = join(OUTPUT_DIR, `${q.question_id}.md`);
          await writeFile(filePath, md, 'utf-8');
          existingIds.add(String(q.question_id));
          totalNew++;
        }

        log(`  Page ${page}: wrote ${newQuestions.length} new, skipped ${skipped} dupes (quota: ${data.quota_remaining})`);

        if (!data.has_more || data.quota_remaining < 10) {
          if (data.quota_remaining < 10) log('  ⚠ Quota low, stopping tag');
          break;
        }
      } catch (err) {
        if (err.response?.status === 502 || err.response?.status === 429) {
          log(`  Rate limited on page ${page}, waiting 10s...`);
          await sleep(10000);
          page--; // retry
        } else {
          log(`  Error on page ${page}: ${err.message}`);
        }
      }
    }
  }

  log(`Done. ${totalNew} new files written, ${totalSkipped} duplicates skipped. Total: ${existingIds.size}`);
}

main().catch(err => { console.error(err); process.exit(1); });
