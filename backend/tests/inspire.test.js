const t = require('node:test'), assert = require('node:assert/strict'), { request, make, env } = require('./helpers'), inspire = require('../services/inspire');
const good = { ok: true, json: async () => ({ images_results: [{ title: 'Modern villa', thumbnail: 'https://t.example/a.jpg', source: 'Example', link: 'https://example.com/p' }, { title: 'Unsafe', thumbnail: 'javascript:alert(1)', source: 'X', link: 'http://insecure.example' }] }) };
t.describe('inspire', () => {
  t.beforeEach(() => inspire._cache.clear());
  t.it('503 not_configured without a key', async () => { const { app } = make(); const r = await request(app).get('/api/inspire?q=modern%20house'); assert.equal(r.status, 503); assert.equal(r.body.error, 'not_configured'); });
  t.it('validates queries', async () => { const { app } = make({ env: env({ SERPAPI_API_KEY: 'k' }) }); for (const q of ['', 'a', '<script>', 'x'.repeat(81)]) assert.equal((await request(app).get('/api/inspire').query({ q })).status, 400); });
  t.it('normalizes results, drops unsafe URLs, caches, and never returns the key', async () => {
    let calls = 0, seen; const { app } = make({ env: env({ SERPAPI_API_KEY: 'SECRETKEY' }), fetchImpl: async u => { calls++; seen = String(u); return good; } });
    const r = await request(app).get('/api/inspire?q=modern%20villa'); assert.equal(r.status, 200); assert.equal(r.body.live, true);
    assert.equal(r.body.results[0].link, 'https://example.com/p'); assert.equal(r.body.results[1].thumbnail, ''); assert.equal(r.body.results[1].link, '');
    assert.ok(!JSON.stringify(r.body).includes('SECRETKEY')); assert.match(seen, /engine=google_images/);
    await request(app).get('/api/inspire?q=modern%20villa'); assert.equal(calls, 1);
  });
  t.it('502 on upstream failure or timeout', async () => {
    let m = make({ env: env({ SERPAPI_API_KEY: 'k' }), fetchImpl: async () => ({ ok: false, status: 500 }) }); assert.equal((await request(m.app).get('/api/inspire?q=house')).status, 502);
    m = make({ env: env({ SERPAPI_API_KEY: 'k' }), fetchImpl: async () => { throw new Error('boom'); } }); assert.equal((await request(m.app).get('/api/inspire?q=house2')).status, 502);
  });
  t.it('health reports configuration without secrets', async () => { const { app } = make({ env: env({ SERPAPI_API_KEY: 'k' }) }); const r = await request(app).get('/api/health'); assert.equal(r.status, 200); assert.equal(r.body.search, 'configured'); assert.equal(r.body.ai, 'not_configured'); assert.ok(!JSON.stringify(r.body).includes('"k"')); });
  t.it('static server exposes only index, css and js', async () => { const { app } = make(); assert.equal((await request(app).get('/')).status, 200); assert.equal((await request(app).get('/js/app.js')).status, 200); for (const p of ['/.env', '/package.json', '/backend/server.js', '/js/../package.json']) assert.equal((await request(app).get(p)).status, 404, p); });
  t.it('CSP allows the inline onclick handlers the page relies on (regression: dead buttons)', async () => { const { app } = make(), r = await request(app).get('/'), csp = r.headers['content-security-policy']; assert.match(csp, /script-src-attr 'unsafe-inline'/); assert.ok(!/script-src-attr 'none'/.test(csp)); assert.match(csp, /script-src 'self' 'unsafe-inline' https:\/\/cdnjs\.cloudflare\.com/); });
});
