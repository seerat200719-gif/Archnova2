const express = require('express'), V = require('../validators/api'), G = require('../services/designGen'), { estimate } = require('../services/estimator'), { analyze } = require('../services/analyzer');
const { ApiError, ah } = require('../middleware/error'), { validateDesign } = require('../validators/design');
module.exports = (env, auth, ai, limiter) => {
  const r = express.Router(); r.use(auth);
  const meta = (prompt, att) => ({ prompt, provider: ai.provider, model: ai.model, generatedAt: new Date().toISOString(), attempts: att });
  const needGood = d => { const v = validateDesign(d); if (!v.ok) throw new ApiError(422, 'invalid_design', 'Design failed validation', v.errors); return v.design; };
  r.post('/generate-design', limiter, ah(async (req, res) => { const b = V.aiGen.parse(req.body), o = await G.generate(ai, b.prompt); res.json({ ok: true, source: 'ai', ...o, meta: meta(b.prompt, o.attempts) }); }));
  r.post('/modify-design', limiter, ah(async (req, res) => { const b = V.aiMod.parse(req.body), cur = needGood(b.design), o = await G.modify(ai, cur, b.instruction); res.json({ ok: true, source: 'ai', ...o, meta: meta(b.instruction, o.attempts) }); }));
  r.post('/explain-design', limiter, ah(async (req, res) => { const b = V.aiExplain.parse(req.body); needGood(b.design); res.json({ ok: true, source: 'ai', explanation: await G.explain(ai, b.design, b.question) }); }));
  // Deterministic endpoints: work without AI credentials. `narrate` optionally adds an AI explanation, clearly separated.
  r.post('/estimate-cost', ah(async (req, res) => { const b = V.costReq.parse(req.body), d = needGood(b.design), e = estimate(d, b.rates || {}); const out = { ok: true, source: 'deterministic', estimate: e }; if (b.narrate && ai.configured) out.aiNarrative = await G.explain(ai, d, `Explain this cost estimate in plain words: ${JSON.stringify(e.breakdown)}`); res.json(out); }));
  r.post('/analyze-design', ah(async (req, res) => { const b = V.analyzeReq.parse(req.body), d = needGood(b.design), out = { ok: true, source: 'deterministic', ...analyze(d) }; if (b.narrate && ai.configured) out.aiNarrative = await G.explain(ai, d, 'Summarise the strengths and weaknesses of this layout.'); res.json(out); }));
  return r;
};
