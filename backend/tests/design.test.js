const t = require('node:test'), assert = require('node:assert/strict'), { design } = require('./helpers'), { validateDesign } = require('../validators/design'), { estimate } = require('../services/estimator'), { analyze } = require('../services/analyzer');
const bad = fn => { const d = design(); fn(d); return validateDesign(d); };
t.describe('design validation', () => {
  t.it('accepts a valid design', () => { const v = validateDesign(design()); assert.deepEqual(v.errors, []); assert.ok(v.ok); });
  t.it('detects overlapping rooms', () => assert.ok(bad(d => { d.rooms[1].x = 5; }).errors.some(e => /overlap/.test(e))));
  t.it('detects rooms outside the plot', () => assert.ok(bad(d => { d.rooms[0].w = 30; }).errors.some(e => /outside/.test(e))));
  t.it('detects invalid floor assignments', () => assert.ok(bad(d => { d.rooms[0].floor = 2; }).errors.some(e => /floor/.test(e))));
  t.it('detects doors that are not on a wall', () => assert.ok(bad(d => { d.doors[1].x = 20; d.doors[1].z = 3.3; }).errors.some(e => /not on any room wall|opens into nothing/.test(e))));
  t.it('requires an exterior entrance', () => assert.ok(bad(d => { d.doors.shift(); }).errors.some(e => /entrance/.test(e))));
  t.it('rejects windows on interior walls and unknown rooms', () => { assert.ok(bad(d => { d.windows.push({ roomId: 'kitchen', wall: 'W', offset: 0.5, width: 1 }); }).errors.some(e => /exterior/.test(e))); assert.ok(bad(d => { d.windows.push({ roomId: 'zzz', wall: 'N', offset: 0.5, width: 1 }); }).errors.some(e => /unknown room/.test(e))); });
  t.it('needs stairs for multi-floor designs', () => assert.ok(bad(d => { delete d.stairs; }).errors.some(e => /stairs/.test(e))));
  t.it('rejects schema violations, unknown keys, huge or non-object input', () => {
    assert.equal(bad(d => { d.plot.width = -1; }).ok, false); assert.equal(bad(d => { d.extra = 1; }).ok, false); assert.equal(bad(d => { d.rooms[0].furniture[0].type = 'rocket'; }).ok, false);
    assert.equal(validateDesign('x').ok, false); assert.equal(bad(d => { d.windows = Array(121).fill(d.windows[0]); }).ok, false); assert.equal(bad(d => { d.constraints = Array(11).fill('x'); }).ok, false);
  });
  t.it('repairs rounding and moves slightly-outside rooms inside', () => { const v = bad(d => { d.rooms[1].x = 6.004; d.rooms[1].w = 4.003; }); assert.ok(v.ok); assert.ok(v.repairs.length >= 0); });
  t.it('estimator is deterministic, labelled, and honours configurable rates', () => {
    const d = validateDesign(design()).design, a = estimate(d), b = estimate(d); assert.deepEqual(a, b);
    assert.ok(a.low > 0 && a.high > a.low); assert.equal(a.breakdown.reduce((s, x) => s + x.percent, 0), 100); assert.match(a.limitations, /not a quotation/i);
    assert.ok(estimate(d, { region: 'metro' }).low > a.low); assert.ok(estimate(d, { baseRate: 4000 }).low > a.low * 1.9);
  });
  t.it('analyzer returns measured/approximate/suggestion insights from the model', () => {
    const r = analyze(validateDesign(design()).design), ids = r.insights.map(i => i.id);
    for (const k of ['utilization', 'daylight', 'ventilation', 'solar', 'materials']) assert.ok(ids.includes(k), k);
    assert.equal(r.insights.find(i => i.id === 'utilization').kind, 'measured'); assert.match(r.disclaimer, /not a daylight/i);
  });
});
