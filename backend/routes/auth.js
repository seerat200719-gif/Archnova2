const express = require('express'), bcrypt = require('bcryptjs'), V = require('../validators/api');
const { ApiError, ah } = require('../middleware/error'), { COOKIE, cookieOpts, sign, requireAuth } = require('../middleware/auth');
module.exports = (env, repo, limiter) => {
  const r = express.Router(), pub = u => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt });
  r.post('/register', limiter, ah(async (req, res) => {
    const b = V.register.parse(req.body);
    let u; try { u = await repo.users.create({ name: b.name, email: b.email, passwordHash: await bcrypt.hash(b.password, env.bcryptRounds) }); }
    catch (e) { if (e.code === 'DUPLICATE') throw new ApiError(409, 'email_taken', 'An account with this email already exists'); throw e; }
    res.cookie(COOKIE, sign(env, u), cookieOpts(env)).status(201).json({ ok: true, user: pub(u) });
  }));
  r.post('/login', limiter, ah(async (req, res) => {
    const b = V.login.parse(req.body), u = await repo.users.findByEmail(b.email);
    const good = u ? await bcrypt.compare(b.password, u.passwordHash) : (await bcrypt.compare(b.password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva'), false);
    if (!good) throw new ApiError(401, 'invalid_credentials', 'Incorrect email or password');
    res.cookie(COOKIE, sign(env, u), cookieOpts(env)).json({ ok: true, user: pub(u) });
  }));
  r.post('/logout', requireAuth(env, repo), ah(async (req, res) => { await repo.users.bumpTokenVersion(req.user.id); res.clearCookie(COOKIE, { path: '/' }).json({ ok: true }); }));
  r.get('/me', requireAuth(env, repo), (req, res) => res.json({ ok: true, user: pub(req.user) }));
  return r;
};
