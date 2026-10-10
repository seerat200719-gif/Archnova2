const { designSchema } = require('../validators/design'), t = require('node:test'), assert = require('node:assert/strict'), { H, make, user, design, state } = require('./helpers');
const mk = async (a, o = {}) => (await a.post('/api/projects').set(H).send({ name: 'My Villa', state: state(), design: design(), ...o })).body.project;
t.describe('projects', () => {
  t.it('create, get, list (without heavy fields), update, delete', async () => {
    const { app } = make(), { a } = await user(app), p = await mk(a);
    assert.equal(p.rev, 1); assert.equal(p.style, 'Modern');
    const g = await a.get(`/api/projects/${p.id}`); assert.equal(g.body.project.state.name, 'Nova'); assert.equal(g.body.project.design.rooms.length, 10);
    const l = await a.get('/api/projects'); assert.equal(l.body.projects.length, 1); assert.equal(l.body.projects[0].state, undefined);
    const u = await a.patch(`/api/projects/${p.id}`).set(H).send({ rev: 1, name: 'Renamed' }); assert.equal(u.body.project.name, 'Renamed'); assert.equal(u.body.project.rev, 2);
    assert.equal((await a.delete(`/api/projects/${p.id}`).set(H)).status, 200); assert.equal((await a.get(`/api/projects/${p.id}`)).status, 404);
  });
  t.it('saved design survives a new session after login', async () => {
    const { app } = make(), { a } = await user(app), p = await mk(a); await a.put(`/api/projects/${p.id}`).set(H).send({ rev: 1, name: 'Saved', state: { ...state(), mat: 'marble' }, design: design() });
    const { request } = require('./helpers'), b = request.agent(app); assert.equal((await b.post('/api/auth/login').set(H).send({ email: 'asha@example.com', password: 'password123' })).status, 200);
    const g = await b.get(`/api/projects/${p.id}`); assert.equal(g.body.project.state.mat, 'marble'); assert.deepEqual(g.body.project.design, designSchema.parse(design()));
  });
  t.it('ownership: other users get 404 and cannot modify', async () => {
    const { app } = make(), A = await user(app, 'Asha'), Bo = await user(app, 'Ben'), p = await mk(A.a);
    assert.equal((await Bo.a.get(`/api/projects/${p.id}`)).status, 404); assert.equal((await Bo.a.patch(`/api/projects/${p.id}`).set(H).send({ rev: 1, name: 'x' })).status, 404);
    assert.equal((await Bo.a.delete(`/api/projects/${p.id}`).set(H)).status, 404); assert.equal((await Bo.a.get('/api/projects')).body.projects.length, 0);
    assert.equal((await Bo.a.post(`/api/projects/${p.id}/duplicate`).set(H)).status, 404); assert.equal((await A.a.get(`/api/projects/${p.id}`)).status, 200);
  });
  t.it('requires auth', async () => { const { app } = make(), { request } = require('./helpers'); assert.equal((await request(app).get('/api/projects')).status, 401); });
  t.it('stale revision gives 409 and does not overwrite', async () => {
    const { app } = make(), { a } = await user(app), p = await mk(a);
    await a.patch(`/api/projects/${p.id}`).set(H).send({ rev: 1, name: 'Newer' });
    const r = await a.patch(`/api/projects/${p.id}`).set(H).send({ rev: 1, name: 'Stale' }); assert.equal(r.status, 409);
    assert.equal((await a.get(`/api/projects/${p.id}`)).body.project.name, 'Newer');
  });
  t.it('validation: bad id, unknown fields, invalid design, bad color', async () => {
    const { app } = make(), { a } = await user(app);
    assert.equal((await a.get('/api/projects/not-an-id')).status, 400);
    assert.equal((await a.post('/api/projects').set(H).send({ name: 'x', state: state(), evil: 1 })).status, 400);
    assert.equal((await a.post('/api/projects').set(H).send({ name: 'x', state: { ...state(), wall: 'red' } })).status, 400);
    const bad = design(); bad.rooms[1].x = 5; const r = await a.post('/api/projects').set(H).send({ name: 'x', state: state(), design: bad });
    assert.equal(r.status, 422); assert.ok(r.body.details.some(m => /overlap/.test(m)));
  });
  t.it('duplicate copies data under a new id', async () => {
    const { app } = make(), { a } = await user(app), p = await mk(a), d = await a.post(`/api/projects/${p.id}/duplicate`).set(H);
    assert.equal(d.status, 201); assert.notEqual(d.body.project.id, p.id); assert.equal(d.body.project.name, 'My Villa (copy)'); assert.deepEqual(d.body.project.design, p.design);
  });
  t.it('export then import round-trips the design and state', async () => {
    const { app } = make(), { a } = await user(app), p = await mk(a, { description: 'desc' }), ex = await a.get(`/api/projects/${p.id}/export`);
    assert.equal(ex.status, 200); assert.equal(ex.body.format, 'archnova-project'); assert.equal(ex.body.schemaVersion, 1); assert.match(ex.headers['content-disposition'], /attachment/);
    const im = await a.post('/api/projects/import').set(H).send(ex.body); assert.equal(im.status, 201);
    assert.deepEqual(im.body.project.design, p.design); assert.deepEqual(im.body.project.state, p.state); assert.equal(im.body.project.description, 'desc');
    assert.equal((await a.post('/api/projects/import').set(H).send({ ...ex.body, schemaVersion: 2 })).status, 400);
  });
});
