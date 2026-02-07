#!/usr/bin/env node
// HumanOracle REST API — search verified human knowledge via QMD

import express from 'express';
import { execFile } from 'child_process';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';
import { existsSync } from 'fs';

const execFileAsync = promisify(execFile);
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3847;
const QMD = process.env.QMD_PATH || '/home/jack/.bun/bin/qmd';
const DATA_DIR = join(import.meta.dirname, '..', 'data');
const COLLECTION = 'human-oracle';
const START_TIME = Date.now();

const log = (msg) => console.log(`[API] ${new Date().toISOString()} ${msg}`);

// --- QMD helpers ---

async function qmdSearch(query, n = 5, mode = 'search') {
  const cmd = mode === 'query' ? 'query' : mode === 'vsearch' ? 'vsearch' : 'search';
  try {
    const { stdout } = await execFileAsync(QMD, [cmd, query, '-n', String(n), '-c', COLLECTION, '--files'], {
      timeout: 30000,
      env: { ...process.env, PATH: `/home/jack/.bun/bin:${process.env.PATH}` },
    });
    return parseQmdOutput(stdout);
  } catch (err) {
    log(`QMD ${cmd} error: ${err.message}`);
    return [];
  }
}

function parseQmdOutput(stdout) {
  // --files format: hash,score,qmd://collection/path
  const results = [];
  for (const line of stdout.trim().split('\n')) {
    if (!line) continue;
    const match = line.match(/^(#?\w+),([0-9.]+),(.+?)(?:,(.*))?$/);
    if (match) {
      results.push({
        hash: match[1],
        score: parseFloat(match[2]),
        path: match[3],
        context: match[4] || '',
      });
    }
  }
  return results;
}

async function parseFrontmatter(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return { content };
    
    const meta = {};
    for (const line of fmMatch[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.+)$/);
      if (kv) {
        let val = kv[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val === 'true') val = true;
        else if (val === 'false') val = false;
        else if (/^\d+$/.test(val)) val = parseInt(val);
        else if (val.startsWith('[') && val.endsWith(']')) {
          val = val.slice(1, -1).split(',').map(s => s.trim());
        }
        meta[kv[1]] = val;
      }
    }
    
    const body = content.slice(fmMatch[0].length).trim();
    return { ...meta, body_preview: body.slice(0, 500) };
  } catch {
    return {};
  }
}

async function countFiles(dir) {
  if (!existsSync(dir)) return 0;
  const files = await readdir(dir, { recursive: true });
  return files.filter(f => f.endsWith('.md')).length;
}

// --- Routes ---

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'human-oracle',
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
    timestamp: new Date().toISOString(),
  });
});

app.get('/search', async (req, res) => {
  const { q, n = 5, mode = 'search' } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing query parameter ?q=' });

  log(`Search: "${q}" (n=${n}, mode=${mode})`);
  const results = await qmdSearch(q, parseInt(n), mode);

  // Enrich with frontmatter
  const enriched = await Promise.all(results.map(async (r) => {
    // Convert qmd://human-oracle/path to local file path
    const localPath = r.path.replace(`qmd://${COLLECTION}/`, '');
    const fullPath = join(DATA_DIR, localPath);
    const meta = await parseFrontmatter(fullPath);
    return {
      score: r.score,
      path: r.path,
      title: meta.title || null,
      url: meta.url || null,
      source: meta.source || null,
      votes: meta.votes || meta.score || 0,
      tags: meta.tags || [],
      body_preview: meta.body_preview || '',
    };
  }));

  res.json({ query: q, count: enriched.length, results: enriched });
});

app.get('/answer/:source/:id', async (req, res) => {
  const { source, id } = req.params;
  const filePath = join(DATA_DIR, source, `${id}.md`);

  if (!existsSync(filePath)) {
    return res.status(404).json({ error: 'Answer not found' });
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    const meta = await parseFrontmatter(filePath);
    res.json({ id, source, ...meta, full_content: content });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/tags', async (req, res) => {
  const tagCounts = {};

  for (const source of ['stackoverflow', 'reddit']) {
    const dir = join(DATA_DIR, source);
    if (!existsSync(dir)) continue;
    const files = await readdir(dir);

    for (const file of files.slice(0, 500)) { // sample for speed
      if (!file.endsWith('.md')) continue;
      const meta = await parseFrontmatter(join(dir, file));
      const tags = Array.isArray(meta.tags) ? meta.tags : [];
      for (const tag of tags) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
      if (meta.subreddit) {
        tagCounts[`r/${meta.subreddit}`] = (tagCounts[`r/${meta.subreddit}`] || 0) + 1;
      }
    }
  }

  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
  res.json({ tags: sorted.map(([tag, count]) => ({ tag, count })) });
});

app.get('/stats', async (req, res) => {
  const soCount = await countFiles(join(DATA_DIR, 'stackoverflow'));
  const redditCount = await countFiles(join(DATA_DIR, 'reddit'));

  let lastUpdated = null;
  for (const source of ['stackoverflow', 'reddit']) {
    const dir = join(DATA_DIR, source);
    if (!existsSync(dir)) continue;
    const s = await stat(dir);
    if (!lastUpdated || s.mtime > lastUpdated) lastUpdated = s.mtime;
  }

  // Try to get QMD collection info
  let qmdStatus = 'unknown';
  try {
    const { stdout } = await execFileAsync(QMD, ['collection', 'list'], { timeout: 5000 });
    qmdStatus = stdout.includes(COLLECTION) ? 'indexed' : 'not indexed';
  } catch { /* ignore */ }

  res.json({
    total_documents: soCount + redditCount,
    sources: { stackoverflow: soCount, reddit: redditCount },
    last_updated: lastUpdated?.toISOString() || null,
    qmd_collection: qmdStatus,
    uptime: Math.floor((Date.now() - START_TIME) / 1000),
  });
});

app.post('/premium/search', async (req, res) => {
  const { query, n = 5 } = req.body || {};
  if (!query) return res.status(400).json({ error: 'Missing query in request body' });

  log(`Premium search: "${query}" (n=${n})`);

  // In production, verify USDC payment here
  // On testnet, all searches are free
  const results = await qmdSearch(query, parseInt(n), 'query');

  const enriched = await Promise.all(results.map(async (r) => {
    const meta = await parseFrontmatter(r.path);
    const content = await readFile(r.path, 'utf-8').catch(() => '');
    return {
      score: r.score,
      path: r.path,
      title: meta.title || null,
      url: meta.url || null,
      source: meta.source || null,
      votes: meta.votes || meta.score || 0,
      tags: meta.tags || [],
      full_content: content,
    };
  }));

  res.json({
    query,
    tier: 'premium',
    note: 'Testnet mode — no USDC required. Production would verify on-chain payment.',
    count: enriched.length,
    results: enriched,
  });
});

app.listen(PORT, () => {
  log(`HumanOracle API running on http://localhost:${PORT}`);
  log(`Data dir: ${DATA_DIR}`);
  log(`QMD binary: ${QMD}`);
});
