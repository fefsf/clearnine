// @vitest-environment node
import http from 'node:http';
import { describe, expect, it } from 'vitest';
import { SUBMIT_TOKEN, createApp } from './index.mjs';

function scoreBody(overrides = {}) {
  return {
    deviceId: 'player-0001',
    name: 'Ada',
    mode: 'classic',
    expert: false,
    score: 40,
    cleared: 2,
    periodKey: '',
    version: '1.12.21',
    ...overrides,
  };
}

async function withApp(opts, fn) {
  const app = createApp({
    persist: false,
    trustProxy: false,
    allRequestsPerHour: 10_000,
    ipPostsPerHour: 10_000,
    devicePostsPerHour: 10_000,
    token: 'test-token',
    ...opts,
  });
  const server = http.createServer(app.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = /** @type {{ port: number }} */ (server.address());
  const base = `http://127.0.0.1:${port}`;
  try {
    await fn({ app, base });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(() => resolve()));
  }
}

async function postScore(base, body, extra = {}) {
  const headers = { 'content-type': 'application/json', ...(extra.headers ?? {}) };
  if (extra.token !== null) headers['x-c9-token'] = extra.token ?? 'test-token';
  if (extra.xff) headers['x-forwarded-for'] = extra.xff;
  const res = await fetch(`${base}/v1/score`, {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

describe('leaderboard server', () => {
  it('keeps the public token installed clients already send', () => {
    expect(SUBMIT_TOKEN).toBe(process.env.C9_SUBMIT_TOKEN || 'c9hzy_4f8e2a91b0c6d3e7');
  });

  it('accepts a classic score and omits the port from health', async () => {
    await withApp({}, async ({ base }) => {
      const posted = await postScore(base, scoreBody());
      expect(posted.status).toBe(200);
      expect(posted.json.ok).toBe(true);
      const health = await fetch(`${base}/health`);
      const body = await health.json();
      expect(body.ok).toBe(true);
      expect(body.port).toBeUndefined();
    });
  });

  it('rejects a bad token, missing id, and the shared anonymous id', async () => {
    await withApp({}, async ({ base }) => {
      const badToken = await postScore(base, scoreBody(), { token: 'nope' });
      expect(badToken.status).toBe(401);
      const bearer = await postScore(base, scoreBody({ deviceId: 'player-0002' }), {
        token: null,
        headers: { authorization: 'Bearer test-token' },
      });
      expect(bearer.status).toBe(200);
      const missing = await postScore(base, scoreBody({ deviceId: '' }));
      expect(missing.status).toBe(400);
      const anon = await postScore(base, scoreBody({ deviceId: 'c9-anonymous' }));
      expect(anon.status).toBe(400);
      expect(anon.json.error).toBe('bad device');
    });
  });

  it('accepts only the period shapes the client sends', async () => {
    await withApp({}, async ({ base }) => {
      const daily = await postScore(base, scoreBody({ mode: 'daily', periodKey: '2026-08-28', deviceId: 'player-day001' }));
      expect(daily.status).toBe(200);
      const week = await postScore(base, scoreBody({ mode: 'weekly', periodKey: '2026-W35', deviceId: 'player-week01' }));
      expect(week.status).toBe(200);
      const all = await postScore(base, scoreBody({ mode: 'daily', periodKey: 'all', deviceId: 'player-day002' }));
      expect(all.status).toBe(400);
      const junk = await postScore(base, scoreBody({ mode: 'classic', periodKey: '../x', deviceId: 'player-0003' }));
      expect(junk.status).toBe(400);
      const badWeek = await postScore(base, scoreBody({ mode: 'weekly', periodKey: '2026-W54', deviceId: 'player-week02' }));
      expect(badWeek.status).toBe(400);
      const board = await fetch(`${base}/v1/board?mode=daily&expert=0&period=nope`);
      expect(board.status).toBe(400);
      const classic = await fetch(`${base}/v1/board?mode=classic&expert=0&period=`);
      expect(classic.status).toBe(200);
    });
  });

  it('caps the body size', async () => {
    await withApp({}, async ({ base }) => {
      const res = await postScore(base, 'x'.repeat(5000));
      expect(res.status).toBe(413);
    });
  });

  it('rate limits posts per IP and ignores X-Forwarded-For unless trusted', async () => {
    await withApp({ ipPostsPerHour: 2, trustProxy: false }, async ({ base }) => {
      const first = await postScore(base, scoreBody({ deviceId: 'player-ip0001' }), { xff: '203.0.113.8' });
      const second = await postScore(base, scoreBody({ deviceId: 'player-ip0002' }), { xff: '203.0.113.9' });
      const third = await postScore(base, scoreBody({ deviceId: 'player-ip0003' }), { xff: '198.51.100.2' });
      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(third.status).toBe(429);
    });

    await withApp({ ipPostsPerHour: 2, trustProxy: true }, async ({ base }) => {
      const a = await postScore(base, scoreBody({ deviceId: 'player-xff001' }), { xff: 'spoofed, 203.0.113.5' });
      const b = await postScore(base, scoreBody({ deviceId: 'player-xff002' }), { xff: 'other, 203.0.113.5' });
      const c = await postScore(base, scoreBody({ deviceId: 'player-xff003' }), { xff: '203.0.113.5' });
      const d = await postScore(base, scoreBody({ deviceId: 'player-xff004' }), { xff: 'spoofed, 203.0.113.9' });
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      expect(c.status).toBe(429);
      expect(d.status).toBe(200);
    });
  });

  it('prunes old daily and weekly boards down to the newest periods', async () => {
    const row = {
      deviceId: 'seed-device-1',
      name: 'Ada',
      score: 10,
      cleared: 1,
      version: '1.12.21',
      at: '2024-01-01T00:00:00.000Z',
    };
    const boards = {
      'daily-2024-01-01': [{ ...row }],
      'expert-daily-2024-01-01': [{ ...row }],
      'daily-2024-01-02': [{ ...row }],
      'daily-2024-01-03': [{ ...row }],
      'daily-not-a-date': [{ ...row }],
      'weekly-2024-W01': [{ ...row }],
      'weekly-2024-W02': [{ ...row }],
      'weekly-2024-W03': [{ ...row }],
      classic: [{ ...row, score: 99 }],
    };
    await withApp({ keepPeriods: 2, db: { boards } }, async ({ app, base }) => {
      const posted = await postScore(
        base,
        scoreBody({ mode: 'daily', periodKey: '2024-01-03', deviceId: 'player-new001', score: 50 }),
      );
      expect(posted.status).toBe(200);
      expect(Object.keys(app.getDb().boards).sort()).toEqual([
        'classic',
        'daily-2024-01-02',
        'daily-2024-01-03',
        'weekly-2024-W02',
        'weekly-2024-W03',
      ]);
    });
  });
});
