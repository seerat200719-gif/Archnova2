const t = require('node:test'), assert = require('node:assert/strict'), { request, H, make, user } = require('./helpers');
t.describe('auth', () => {
  t.it('registers, hides the hash, sets an httpOnly cookie', async () => {
    const { app } = make(); const r = await request(app).post('/api/auth/register').set(H).send({ name: 'A', email: 'A@Example.com', password: 'password123' });
    assert.equal(r.status, 201); assert.equal(r.body.user.email, 'a@example.com'); assert.ok(!JSON.stringify(r.body).includes('passwordHash'));
    assert.match(r.headers['set-cookie'][0], /HttpOnly/);
  });
  t.it('rejects duplicate email, bad email and short password', async () => {
    const { app } = make(); await user(app, 'Asha');
    assert.equal((await request(app).post('/api/auth/register').set(H).send({ name: 'x', email: 'asha@example.com', password: 'password123' })).status, 409);
    assert.equal((await request(app).post('/api/auth/register').set(H).send({ name: 'x', email: 'nope', password: 'password123' })).status, 400);
    assert.equal((await request(app).post('/api/auth/register').set(H).send({ name: 'x', email: 'b@example.com', password: 'short' })).status, 400);
  });
  t.it('login: success, wrong password, unknown user', async () => {
    const { app } = make(); await user(app, 'Asha');
    assert.equal((await request(app).post('/api/auth/login').set(H).send({ email: 'asha@example.com', password: 'password123' })).status, 200);
    assert.equal((await request(app).post('/api/auth/login').set(H).send({ email: 'asha@example.com', password: 'wrongpass1' })).status, 401);
    assert.equal((await request(app).post('/api/auth/login').set(H).send({ email: 'ghost@example.com', password: 'password123' })).status, 401);
  });
  t.it('me needs auth; logout revokes the old token', async () => {
    const { app } = make(); assert.equal((await request(app).get('/api/auth/me')).status, 401);
    const { a, cookie } = await user(app, 'Asha'); assert.equal((await a.get('/api/auth/me')).status, 200);
    assert.equal((await a.post('/api/auth/logout').set(H)).status, 200);
    assert.equal((await a.get('/api/auth/me')).status, 401);
    assert.equal((await request(app).get('/api/auth/me').set('Cookie', cookie)).status, 401);
  });
  t.it('blocks state-changing requests without the CSRF header', async () => {
    const { app } = make(); assert.equal((await request(app).post('/api/auth/login').send({ email: 'a@b.co', password: 'x' })).status, 403);
  });
  t.it('returns 503 when no database is configured', async () => {
    const { createApp } = require('../app'), { env } = require('./helpers'), app = createApp({ env: env({ DB_MODE: 'none' }), repo: null });
    assert.equal((await request(app).post('/api/auth/login').set(H).send({ email: 'a@b.co', password: 'x' })).status, 503);
    const h = await request(app).get('/api/health'); assert.equal(h.body.db, 'not_configured');
  });
});
