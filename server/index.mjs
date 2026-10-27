/**
 * ClearNine leaderboard API.
 * Bind: 0.0.0.0:45589  (Cloudflare → https://c9.heezynet.com)
 *
 * X-C9-Token is a public speed bump (the app ships the same value). It is not
 * a secret. X-Forwarded-For is used only when C9_TRUST_PROXY=1 — see README.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOST = process.env.C9_HOST || '0.0.0.0';
const PORT = Number(process.env.C9_PORT || 45589);
const TOKEN = process.env.C9_SUBMIT_TOKEN || 'c9hzy_4f8e2a91b0c6d3e7';
export const SUBMIT_TOKEN = TOKEN;
const DATA_FILE = path.join(__dirname, 'data', 'scores.json');
const MAX_SCORE = 250_000;
const MAX_NAME = 20;
const MAX_BODY = 4096;
const KEEP_PER_BOARD = 50;
const KEEP_PERIODS = 60;
const POST_PER_HOUR = 40;
const IP_POSTS_PER_HOUR = 60;
const ALL_REQUESTS_PER_HOUR = 600;
const HOUR_MS = 60 * 60 * 1000;

const MODES = new Set(['classic', 'daily', 'weekly', 'blitz']);
const TIMELESS = new Set(['classic', 'expert-classic', 'blitz']);
const DATE_PERIOD = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const WEEK_PERIOD = /^(\d{4})-W(0[1-9]|[1-4]\d|5[0-3])$/;

export function boardKey(mode, expert, periodKey) {
  const exp = expert ? 'expert-' : '';
  if (mode === 'classic') return `${exp}classic`;
  if (mode === 'daily') return `${exp}daily-${periodKey || ''}`;
  if (mode === 'weekly') return `weekly-${periodKey || ''}`;
  if (mode === 'blitz') return 'blitz';
  return null;
}

/** Client sends '' (classic/blitz), YYYY-MM-DD (daily), or YYYY-Www (weekly). */
export function periodOk(mode, periodKey) {
  const period = String(periodKey ?? '');
  if (mode === 'daily') return DATE_PERIOD.test(period);
  if (mode === 'weekly') return WEEK_PERIOD.test(period);
  if (mode === 'classic' || mode === 'blitz') return period === '';
  return false;
}

function trustProxyFromEnv() {
  return /^(1|true|yes)$/i.test(String(process.env.C9_TRUST_PROXY || '').trim());
}

/**
 * Right-most X-Forwarded-For hop, and only when the direct peer is a trusted
 * proxy (Cloudflare appends the client it saw). Otherwise the socket address.
 */
function clientIp(req, trustProxy) {
  if (trustProxy) {
    const header = req.headers['x-forwarded-for'];
    const raw = Array.isArray(header) ? header.join(',') : String(header || '');
    const parts = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const hop = parts[parts.length - 1];
    if (hop) return hop.slice(0, 80);
  }
  const addr = req.socket?.remoteAddress || '';
  return String(addr).replace(/^::ffff:/, '').slice(0, 80) || 'unknown';
}

function tooMany(map, key, limit, now = Date.now()) {
  const cutoff = now - HOUR_MS;
  if (map.size > 4000) {
    for (const [k, stamps] of map) {
      const fresh = stamps.filter((t) => t > cutoff);
      if (fresh.length === 0) map.delete(k);
      else map.set(k, fresh);
    }
  }
  const hits = (map.get(key) || []).filter((t) => t > cutoff);
  if (hits.length >= limit) {
    map.set(key, hits);
    return true;
  }
  hits.push(now);
  map.set(key, hits);
  return false;
}

class RequestError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
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

function readBody(req, maxBody) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBody) {
      reject(new RequestError(413, 'too large'));
      return;
    }
    const chunks = [];
    let size = 0;
    let settled = false;
    const fail = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    const ok = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    req.on('data', (chunk) => {
      if (settled) return;
      size += chunk.length;
      if (size > maxBody) {
        fail(new RequestError(413, 'too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => ok(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => fail(new RequestError(400, 'bad json')));
  });
}

function tokenOk(req, token) {
  const header = req.headers.authorization || '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  const custom = String(req.headers['x-c9-token'] || '').trim();
  return bearer === token || custom === token;
}

function cleanName(raw) {
  const name = String(raw ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
  if (!name || !/^[\p{L}\p{N} ._\-]+$/u.test(name)) return null;
  return name;
}

function cleanDeviceId(raw) {
  const id = String(raw ?? '').trim();
  if (id.length < 8 || id.length > 64) return null;
  if (id.toLowerCase() === 'c9-anonymous') return null;
  if (!/^[\x21-\x7E]+$/.test(id)) return null;
  return id;
}

/**
 * @param {object} [options]
 * @param {string} [options.dataFile]
 * @param {string} [options.token]
 * @param {boolean} [options.trustProxy]
 * @param {boolean} [options.persist]
 * @param {number} [options.keepPeriods]
 * @param {number} [options.maxBody]
 * @param {number} [options.ipPostsPerHour]
 * @param {number} [options.devicePostsPerHour]
 * @param {number} [options.allRequestsPerHour]
 * @param {{ boards: Record<string, unknown[]> }} [options.db]
 */
export function createApp(options = {}) {
  const dataFile = options.dataFile ?? DATA_FILE;
  const token = options.token ?? TOKEN;
  const trustProxy = options.trustProxy ?? trustProxyFromEnv();
  const persist = options.persist !== false;
  const keepPeriods = options.keepPeriods ?? KEEP_PERIODS;
  const maxBody = options.maxBody ?? MAX_BODY;
  const ipPostsPerHour = options.ipPostsPerHour ?? IP_POSTS_PER_HOUR;
  const devicePostsPerHour = options.devicePostsPerHour ?? POST_PER_HOUR;
  const allRequestsPerHour = options.allRequestsPerHour ?? ALL_REQUESTS_PER_HOUR;
  const db = options.db && typeof options.db === 'object' ? options.db : { boards: {} };
  if (!db.boards || typeof db.boards !== 'object') db.boards = {};

  /** @type {Map<string, number[]>} */
  const recentPosts = new Map();
  /** @type {Map<string, number[]>} */
  const recentPostIps = new Map();
  /** @type {Map<string, number[]>} */
  const recentAll = new Map();

  function saveDb() {
    if (!persist) return;
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    const tmp = `${dataFile}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
    fs.renameSync(tmp, dataFile);
  }

  function dropOldest(groups) {
    const periods = [...groups.keys()].sort();
    const extra = periods.length - keepPeriods;
    if (extra <= 0) return false;
    for (const period of periods.slice(0, extra)) {
      for (const key of groups.get(period)) delete db.boards[key];
    }
    return true;
  }

  /** Keep the newest N daily dates and N weekly keys. Drop malformed dated keys. */
  function pruneOldBoards() {
    const daily = new Map();
    const weekly = new Map();
    let changed = false;
    for (const key of Object.keys(db.boards)) {
      if (TIMELESS.has(key)) continue;
      const dailyMatch = /^(?:expert-)?daily-(\d{4}-\d{2}-\d{2})$/.exec(key);
      if (dailyMatch && DATE_PERIOD.test(dailyMatch[1])) {
        const list = daily.get(dailyMatch[1]) ?? [];
        list.push(key);
        daily.set(dailyMatch[1], list);
        continue;
      }
      const weeklyMatch = /^weekly-(\d{4}-W\d{2})$/.exec(key);
      if (weeklyMatch && WEEK_PERIOD.test(weeklyMatch[1])) {
        const list = weekly.get(weeklyMatch[1]) ?? [];
        list.push(key);
        weekly.set(weeklyMatch[1], list);
        continue;
      }
      if (/^(?:expert-)?daily-|^weekly-/.test(key)) {
        delete db.boards[key];
        changed = true;
      }
    }
    if (dropOldest(daily)) changed = true;
    if (dropOldest(weekly)) changed = true;
    return changed;
  }

  function loadDb() {
    try {
      const raw = fs.readFileSync(dataFile, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.boards && typeof parsed.boards === 'object') {
        db.boards = parsed.boards;
      } else {
        db.boards = {};
      }
    } catch {
      db.boards = {};
    }
    if (pruneOldBoards()) saveDb();
  }

  function handleHealth(_req, res) {
    json(res, 200, { ok: true, service: 'clearnine-board' });
  }

  function handleGetBoard(url, res) {
    const mode = url.searchParams.get('mode') || 'classic';
    const expert = url.searchParams.get('expert') === '1';
    const period = url.searchParams.get('period') || '';
    const deviceId = String(url.searchParams.get('device') || '').slice(0, 64);
    if (!MODES.has(mode)) {
      json(res, 400, { error: 'bad board' });
      return;
    }
    if (!periodOk(mode, period)) {
      json(res, 400, { error: 'bad period' });
      return;
    }
    const key = boardKey(mode, expert, period);
    if (!key) {
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

  async function handlePostScore(req, res, ip) {
    if (!tokenOk(req, token)) {
      json(res, 401, { error: 'bad token' });
      return;
    }
    let body;
    try {
      body = JSON.parse(await readBody(req, maxBody));
    } catch (err) {
      if (err instanceof RequestError) throw err;
      json(res, 400, { error: 'bad json' });
      return;
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      json(res, 400, { error: 'bad json' });
      return;
    }
    const mode = String(body.mode || '');
    const expert = Boolean(body.expert);
    const periodKey = String(body.periodKey || '');
    const name = cleanName(body.name);
    const deviceId = cleanDeviceId(body.deviceId);
    const score = Number(body.score);
    const cleared = Math.max(0, Math.floor(Number(body.cleared) || 0));
    const version = String(body.version || '').slice(0, 24);

    if (!MODES.has(mode) || !name) {
      json(res, 400, { error: 'bad fields' });
      return;
    }
    if (!periodOk(mode, periodKey)) {
      json(res, 400, { error: 'bad period' });
      return;
    }
    const key = boardKey(mode, expert, periodKey);
    if (!key) {
      json(res, 400, { error: 'bad fields' });
      return;
    }
    if (!deviceId) {
      json(res, 400, { error: 'bad device' });
      return;
    }
    if (!Number.isFinite(score) || score < 1 || score > MAX_SCORE) {
      json(res, 400, { error: 'bad score' });
      return;
    }
    if (tooMany(recentPostIps, ip, ipPostsPerHour)) {
      json(res, 429, { error: 'slow down' });
      return;
    }
    if (tooMany(recentPosts, deviceId, devicePostsPerHour)) {
      json(res, 429, { error: 'slow down' });
      return;
    }

    const list = db.boards[key] || [];
    const now = new Date().toISOString();
    const existing = list.find((r) => r.deviceId === deviceId);
    if (existing && score <= existing.score) {
      if (pruneOldBoards()) saveDb();
      json(res, 200, { ok: true, improved: false, best: existing.score, key });
      return;
    }
    if (existing) {
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
    pruneOldBoards();
    saveDb();
    const saved = db.boards[key];
    if (!saved) {
      json(res, 200, { ok: true, improved: false, key });
      return;
    }
    const rank = saved.findIndex((r) => r.deviceId === deviceId) + 1;
    json(res, 200, { ok: true, improved: true, best: Math.floor(score), rank, key });
  }

  async function handler(req, res) {
    cors(res);
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }
      const ip = clientIp(req, trustProxy);
      if (tooMany(recentAll, ip, allRequestsPerHour)) {
        json(res, 429, { error: 'slow down' });
        return;
      }
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
        handleHealth(req, res);
        return;
      }
      if (req.method === 'GET' && url.pathname === '/v1/board') {
        handleGetBoard(url, res);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/v1/score') {
        await handlePostScore(req, res, ip);
        return;
      }
      json(res, 404, { error: 'not found' });
    } catch (err) {
      if (err instanceof RequestError) {
        if (!res.headersSent) json(res, err.status, { error: err.code });
        req.destroy();
        return;
      }
      console.error(err);
      if (!res.headersSent) json(res, 500, { error: 'server' });
    }
  }

  return { handler, loadDb, getDb: () => db };
}

function isDirectRun() {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const self = fs.realpathSync(fileURLToPath(import.meta.url));
    const invoked = fs.realpathSync(path.resolve(entry));
    if (process.platform === 'win32') return self.toLowerCase() === invoked.toLowerCase();
    return self === invoked;
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  const app = createApp();
  app.loadDb();
  const server = http.createServer((req, res) => {
    Promise.resolve(app.handler(req, res)).catch((err) => {
      console.error(err);
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'server' }));
      }
    });
  });
  server.listen(PORT, HOST, () => {
    console.log(`ClearNine board listening on http://${HOST}:${PORT}`);
  });
}
