const t = require('node:test'), assert = require('node:assert/strict'), { request, H, make, user, design, state, plan, hexOf } = require('./helpers'), X = require('../services/exporter'), { parseImport } = require('../routes/export');
const post = (app, p, body) => request(app).post('/api/export/' + p).set(H).send(body).buffer(true).parse((res, cb) => { const c = []; res.on('data', b => c.push(b)); res.on('end', () => cb(null, Buffer.concat(c))); });
t.describe('exports', () => {
  t.it('floor plan SVG uses real geometry, escapes text, differs per floor', async () => {
    const { app } = make(), r0 = await post(app, 'floorplan.svg', { plan: plan(), floor: 0 }), s0 = r0.body.toString(), r1 = await post(app, 'floorplan.svg', { plan: plan(), floor: 1 }), s1 = r1.body.toString();
    assert.equal(r0.status, 200); assert.match(r0.headers['content-type'], /image\/svg\+xml/); assert.match(r0.headers['content-disposition'], /attachment; filename="Nova_Villa_-ground-floor\.svg"/);
    assert.ok(s0.startsWith('<svg') && s0.endsWith('</svg>')); assert.equal((s0.match(/data-room=/g) || []).length, 5); assert.equal((s1.match(/data-room=/g) || []).length, 5);
    assert.ok(s0.includes('Living Room') && !s0.includes('Master Bedroom') && s1.includes('Master Bedroom')); assert.ok(s0.includes('Nova &lt;Villa&gt;') && !s0.includes('<Villa>'));
    assert.equal((s0.match(/stroke="#3b82c4"/g) || []).length, 2); assert.equal((s1.match(/stroke="#3b82c4"/g) || []).length, 1); assert.ok(s0.includes('>UP<') && s1.includes('stair opening'));
  });
  t.it('floor plan PDF and summary PDF are real PDFs containing the project data', async () => {
    const { app } = make(), fp = await post(app, 'floorplan.pdf', { plan: plan() }), sm = await post(app, 'summary.pdf', { plan: plan() });
    for (const r of [fp, sm]) { assert.equal(r.status, 200); assert.match(r.headers['content-type'], /application\/pdf/); assert.equal(r.body.slice(0, 5).toString(), '%PDF-'); assert.ok(r.body.toString('latin1').includes('%%EOF')); assert.ok(r.body.length > 3000); }
    const txt = b => b.toString('latin1'); assert.ok((txt(fp.body).match(/\/Type \/Page\b/g) || []).length >= 3); assert.ok((txt(sm.body).match(/\/Type \/Page\b/g) || []).length >= 4);
    assert.ok(txt(sm.body).includes(hexOf('Master Bedroom')) && txt(sm.body).includes(hexOf('Room schedule')) && txt(sm.body).includes(hexOf('Limitations')) && txt(sm.body).includes(hexOf('planning estimate')));
  });
  t.it('summary cost matches the deterministic estimator', async () => { const p = plan(), e = X.planEstimate(p); assert.ok(e.low > 0 && e.high > e.low); assert.match(e.limitations, /not a quotation/i); const { app } = make(), sm = (await post(app, 'summary.pdf', { plan: p })).body.toString('latin1'); assert.ok(sm.includes(hexOf(Math.round(e.low).toLocaleString('en-IN')))); });
  t.it('rejects invalid plans', async () => {
    const { app } = make(), bad = (fn) => { const p = plan(); fn(p); return post(app, 'floorplan.svg', { plan: p }); };
    assert.equal((await bad(p => { p.rooms[0].w = -1; })).status, 400); assert.equal((await bad(p => { p.rooms[0].furniture[0].type = 'rocket'; })).status, 400); assert.equal((await bad(p => { p.floors = 5; })).status, 400);
    assert.equal((await bad(p => { p.rooms = Array(41).fill(p.rooms[0]); })).status, 400); assert.equal((await bad(p => { p.extra = 1; })).status, 400);
    assert.equal((await request(app).post('/api/export/summary.pdf').send({ plan: plan() })).status, 403);
  });
  t.it('import validation: accepts project/backup files, rejects wrong versions and invalid designs', async () => {
    const { app } = make(), env = { format: 'archnova-project', schemaVersion: 1, exportedAt: new Date().toISOString(), project: { name: 'X', state: state(), design: design() } };
    const ok = await request(app).post('/api/export/validate-import').set(H).send(env); assert.equal(ok.status, 200); assert.equal(ok.body.kind, 'project'); assert.equal(ok.body.projects[0].design.rooms.length, 10);
    assert.equal((await request(app).post('/api/export/validate-import').set(H).send({ ...env, schemaVersion: 2 })).status, 400); assert.equal((await request(app).post('/api/export/validate-import').set(H).send({ format: 'nope' })).status, 400);
    const badD = design(); badD.rooms[1].x = 5; const r = await request(app).post('/api/export/validate-import').set(H).send({ ...env, project: { ...env.project, design: badD } }); assert.equal(r.status, 422); assert.ok(r.body.details.some(m => /overlap/.test(m)));
    const bk = await request(app).post('/api/export/validate-import').set(H).send({ format: 'archnova-backup', schemaVersion: 1, exportedAt: 'x', projects: [env.project, env.project] }); assert.equal(bk.body.kind, 'backup'); assert.equal(bk.body.projects.length, 2);
    assert.equal((await request(app).post('/api/export/validate-import').set(H).send({ format: 'archnova-project', pad: 'x'.repeat(1.2e6) })).status, 413);
  });
  t.it('backup and restore: all projects round trip, thumbnails excluded, isolated per user', async () => {
    const { app } = make(), A = await user(app, 'Asha'), B = await user(app, 'Ben');
    for (const n of ['One', 'Two', 'Three']) await A.a.post('/api/projects').set(H).send({ name: n, state: state(), design: n === 'Two' ? design() : null });
    const bk = await A.a.get('/api/projects/backup'); assert.equal(bk.status, 200); assert.equal(bk.body.format, 'archnova-backup'); assert.equal(bk.body.projects.length, 3); assert.ok(bk.body.projects.every(p => !('thumbnail' in p) && !('owner' in p)));
    assert.equal((await B.a.get('/api/projects')).body.projects.length, 0);
    const rs = await B.a.post('/api/projects/restore').set(H).send(bk.body); assert.equal(rs.status, 201); assert.equal(rs.body.created, 3);
    const list = (await B.a.get('/api/projects')).body.projects; assert.deepEqual(list.map(p => p.name).sort(), ['One', 'Three', 'Two']);
    const two = list.find(p => p.name === 'Two'), full = (await B.a.get('/api/projects/' + two.id)).body.project; assert.equal(full.design.rooms.length, 10); assert.equal((await A.a.get('/api/projects')).body.projects.length, 3);
    const badBk = { ...bk.body, projects: [...bk.body.projects, { name: 'Bad', state: state(), design: (() => { const d = design(); d.rooms[1].x = 5; return d; })() }] }; assert.equal((await B.a.post('/api/projects/restore').set(H).send(badBk)).status, 422); assert.equal((await B.a.get('/api/projects')).body.projects.length, 3);
    const { request: rq } = require('./helpers'); assert.equal((await rq(app).get('/api/projects/backup')).status, 401); assert.equal((await B.a.post('/api/projects/restore').set(H).send({ format: 'archnova-project' })).status, 400);
  });
  t.it('export then validate then save then export again keeps design and state identical', async () => {
    const { app } = make(), { a } = await user(app), p = (await a.post('/api/projects').set(H).send({ name: 'RT', state: state(), design: design() })).body.project, ex1 = (await a.get(`/api/projects/${p.id}/export`)).body;
    const v = (await request(app).post('/api/export/validate-import').set(H).send(ex1)).body, p2 = (await a.post('/api/projects').set(H).send(v.projects[0])).body.project, ex2 = (await a.get(`/api/projects/${p2.id}/export`)).body;
    assert.deepEqual(ex2.project, ex1.project); assert.equal(ex2.schemaVersion, 1); assert.ok(!isNaN(Date.parse(ex2.exportedAt)));
  });
});
