const t = require('node:test'), assert = require('node:assert/strict'), { H, make, user, design, fakeAi, env } = require('./helpers'), { createAi } = require('../services/ai');
const gen = (a, p = 'Design a modern two storey family home with three bedrooms') => a.post('/api/ai/generate-design').set(H).send({ prompt: p });
t.describe('ai routes (provider mocked)', () => {
  t.it('requires auth', async () => { const { app } = make({ ai: fakeAi([design()]) }), { request } = require('./helpers'); assert.equal((await request(app).post('/api/ai/generate-design').set(H).send({ prompt: 'x'.repeat(20) })).status, 401); });
  t.it('returns a validated design and metadata', async () => {
    const ai = fakeAi(['Here you go:\n```json\n' + JSON.stringify(design()) + '\n```']), { app } = make({ ai }), { a } = await user(app), r = await gen(a);
    assert.equal(r.status, 200); assert.equal(r.body.source, 'ai'); assert.equal(r.body.design.rooms.length, 10); assert.equal(r.body.meta.provider, 'fake'); assert.equal(r.body.meta.attempts, 1);
  });
  t.it('regenerates once with validation feedback after an invalid design', async () => {
    const badD = design(); badD.rooms[1].x = 5, ai = fakeAi([badD, design()]); const { app } = make({ ai }), { a } = await user(app), r = await gen(a);
    assert.equal(r.status, 200); assert.equal(r.body.meta.attempts, 2); assert.match(ai.calls[1], /failed validation.*overlap/);
  });
  t.it('returns 422 when the AI never produces a valid design', async () => {
    const badD = design(); badD.rooms[1].x = 5; const { app } = make({ ai: fakeAi([badD, badD]) }), { a } = await user(app), r = await gen(a);
    assert.equal(r.status, 422); assert.equal(r.body.error, 'invalid_ai_design'); assert.ok(r.body.details.length);
  });
  t.it('handles non-JSON replies and provider failures', async () => {
    let m = make({ ai: fakeAi(['sorry, no']) }), u = await user(m.app); assert.equal((await gen(u.a)).status, 422);
    m = make({ ai: fakeAi([Object.assign(new (require('../middleware/error').ApiError)(502, 'ai_provider_error', 'down'))]) }); u = await user(m.app); assert.equal((await gen(u.a)).status, 502);
  });
  t.it('503 with a setup message when no AI key is configured', async () => {
    const { app } = make({ env: env() }), { a } = await user(app), r = await gen(a); assert.equal(r.status, 503); assert.equal(r.body.error, 'ai_not_configured'); assert.match(r.body.message, /ANTHROPIC_API_KEY/);
  });
  t.it('modify returns the new design and a diff that shows what changed', async () => {
    const d2 = design(); d2.style = 'Luxury'; const { app } = make({ ai: fakeAi([d2]) }), { a } = await user(app);
    const r = await a.post('/api/ai/modify-design').set(H).send({ design: design(), instruction: 'Make the living room narrower' });
    assert.equal(r.status, 200); assert.deepEqual(r.body.diff, [{ field: 'style', from: 'Modern', to: 'Luxury' }]);
    const G = require('../services/designGen'), x = design(), y = design(); y.rooms[0].w = 5; y.rooms.pop(); assert.deepEqual(G.diff(x, y), [{ room: 'living', change: 'resized_or_moved' }, { room: 'balcony', change: 'removed' }]);
  });
  t.it('rejects an invalid current design in modify and validates input', async () => {
    const { app } = make({ ai: fakeAi([design()]) }), { a } = await user(app), bad = design(); bad.rooms[1].x = 5;
    assert.equal((await a.post('/api/ai/modify-design').set(H).send({ design: bad, instruction: 'do something' })).status, 422);
    assert.equal((await a.post('/api/ai/generate-design').set(H).send({ prompt: 'short' })).status, 400);
  });
  t.it('estimate-cost and analyze-design are deterministic and work without AI credentials', async () => {
    const { app } = make({ env: env() }), { a } = await user(app);
    const c = await a.post('/api/ai/estimate-cost').set(H).send({ design: design(), rates: { region: 'metro' } }); assert.equal(c.status, 200); assert.equal(c.body.source, 'deterministic'); assert.ok(c.body.estimate.low > 0);
    const n = await a.post('/api/ai/analyze-design').set(H).send({ design: design() }); assert.equal(n.status, 200); assert.ok(n.body.insights.length >= 5); assert.equal(n.body.aiNarrative, undefined);
  });
  t.it('explain-design returns AI text', async () => { const { app } = make({ ai: fakeAi(['Because the kitchen is next to the dining room.']) }), { a } = await user(app); const r = await a.post('/api/ai/explain-design').set(H).send({ design: design(), question: 'Why this kitchen?' }); assert.equal(r.status, 200); assert.match(r.body.explanation, /kitchen/); });
  t.it('provider adapter: sends the key header, retries 429, and never leaks the key in errors', async () => {
    let n = 0; const f = async (u, o) => (++n < 2 ? { ok: false, status: 429 } : { ok: true, json: async () => ({ content: [{ type: 'text', text: 'hi' }] }), seen: o.headers['x-api-key'] });
    const ai = createAi(env({ ANTHROPIC_API_KEY: 'sk-secret-123' }), f); assert.equal(await ai.complete('s', 'u'), 'hi'); assert.equal(n, 2);
    const failing = createAi(env({ ANTHROPIC_API_KEY: 'sk-secret-123' }), async () => ({ ok: false, status: 500 })); await assert.rejects(() => failing.complete('s', 'u'), e => !/sk-secret/.test(e.message) && e.status === 502);
  });
});
