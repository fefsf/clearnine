/**
 * ClearNine leaderboard API.
 * Bind: 0.0.0.0:45589  (Cloudflare → https://c9.heezynet.com)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.C9_HOST || '0.0.0.0';
const PORT = Number(process.env.C9_PORT || 45589);
const TOKEN = process.env.C9_SUBMIT_TOKEN || 'c9hzy_4f8e2a91b0c6d3e7';
const DATA_FILE = path.join(__dirname, 'data', 'scores.json');
const MAX_SCORE = 250_000;
const MAX_NAME = 20;
const KEEP_PER_BOARD = 50;
const POST_PER_HOUR = 40;

/** @type {{ boards: Record<string, Array<{
 *   deviceId: string, name: string, score: number, cleared: number,
 *   version: string, at: string
 * }>> }} */
let db = { boards: {} };
/** @type {Map<string, number[]>} */
const recentPosts = new Map();

const MODES = new Set(['classic', 'daily', 'weekly', 'blitz']);

export function boardKey(mode, expert, periodKey) {
  const exp = expert ? 'expert-' : '';
  if (mode === 'classic') return `${exp}classic`;
  if (mode === 'daily') return `${exp}daily-${periodKey || ''}`;
  if (mode === 'weekly') return `weekly-${periodKey || ''}`;
  if (mode === 'blitz') return 'blitz';
  return null;
}

function loadDb() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.boards) db = parsed;
  } catch {
    db = { boards: {} };
  }
}

function saveDb() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-C9-Token');
}

function json(res, code, body) {
  cors(res);
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 32_768) {
        reject(new Error('too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function tokenOk(req) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const custom = String(req.headers['x-c9-token'] || '').trim();
  return bearer === TOKEN || custom === TOKEN;
}

function cleanName(raw) {
  const name = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
  if (!name || !/^[\p{L}\p{N} ._\-]+$/u.test(name)) return null;
  return name;
}

function rateLimited(deviceId) {
  const now = Date.now();
  const hour = now - 60 * 60 * 1000;
  const hits = (recentPosts.get(deviceId) || []).filter((t) => t > hour);
  if (hits.length >= POST_PER_HOUR) {
    recentPosts.set(deviceId, hits);
    return true;
  }
  hits.push(now);
  recentPosts.set(deviceId, hits);
  return false;
}

function handleHealth(_req, res) {
  json(res, 200, { ok: true, service: 'clearnine-board', port: PORT });
}

function handleGetBoard(url, res) {
  const mode = url.searchParams.get('mode') || 'classic';
  const expert = url.searchParams.get('expert') === '1';
  const period = url.searchParams.get('period') || '';
  const deviceId = String(url.searchParams.get('device') || '').slice(0, 64);
  const key = boardKey(mode, expert, period);
  if (!key || !MODES.has(mode)) {
    json(res, 400, { error: 'bad board' });
    return;
  }
  const rows = [...(db.boards[key] || [])]
    .sort((a, b) => b.score - a.score || a.at.localeCompare(b.at))
    .slice(0, 20)
    .map((row, i) => ({
      rank: i + 1,
      name: row.name,
      score: row.score,
      you: deviceId !== '' && row.deviceId === deviceId,
    }));
  json(res, 200, { key, rows });
}

async function handlePostScore(req, res) {
  if (!tokenOk(req)) {
    json(res, 401, { error: 'bad token' });
    return;
  }
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    json(res, 400, { error: 'bad json' });
    return;
  }
  const mode = String(body.mode || '');
  const expert = Boolean(body.expert);
  const periodKey = String(body.periodKey || '');
  const key = boardKey(mode, expert, periodKey);
  const name = cleanName(body.name);
  const deviceId = String(body.deviceId || '').slice(0, 64);
  const score = Number(body.score);
  const cleared = Math.max(0, Math.floor(Number(body.cleared) || 0));
  const version = String(body.version || '').slice(0, 24);

  if (!key || !MODES.has(mode) || !name || deviceId.length < 8) {
    json(res, 400, { error: 'bad fields' });
    return;
  }
  if (mode === 'daily' || mode === 'weekly') {
    if (!periodKey || periodKey.length > 24) {
      json(res, 400, { error: 'bad period' });
      return;
    }
  }
  if (!Number.isFinite(score) || score < 1 || score > MAX_SCORE) {
    json(res, 400, { error: 'bad score' });
    return;
  }
  if (rateLimited(deviceId)) {
    json(res, 429, { error: 'slow down' });
    return;
  }

  const list = db.boards[key] || [];
  const now = new Date().toISOString();
  const existing = list.find((r) => r.deviceId === deviceId);
  if (existing) {
    if (score <= existing.score) {
      json(res, 200, { ok: true, improved: false, best: existing.score, key });
      return;
    }
    existing.name = name;
    existing.score = Math.floor(score);
    existing.cleared = cleared;
    existing.version = version;
    existing.at = now;
  } else {
    list.push({
      deviceId,
      name,
      score: Math.floor(score),
      cleared,
      version,
      at: now,
    });
  }
  list.sort((a, b) => b.score - a.score || a.at.localeCompare(b.at));
  db.boards[key] = list.slice(0, KEEP_PER_BOARD);
  saveDb();
  const rank = db.boards[key].findIndex((r) => r.deviceId === deviceId) + 1;
  json(res, 200, { ok: true, improved: true, best: Math.floor(score), rank, key });
}

const server = http.createServer(async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  try {
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
      handleHealth(req, res);
      return;
    }
    if (req.method === 'GET' && url.pathname === '/v1/board') {
      handleGetBoard(url, res);
      return;
    }
    if (req.method === 'POST' && url.pathname === '/v1/score') {
      await handlePostScore(req, res);
      return;
    }
    json(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    json(res, 500, { error: 'server' });
  }
});

loadDb();
server.listen(PORT, HOST, () => {
  console.log(`ClearNine board listening on http://${HOST}:${PORT}`);
});
