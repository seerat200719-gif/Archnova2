const jwt = require('jsonwebtoken'), { ApiError, ah } = require('./error');
const COOKIE = 'an_token';
const cookieOpts = env => ({ httpOnly: true, sameSite: 'lax', secure: env.prod, maxAge: 7 * 864e5, path: '/' });
const sign = (env, u) => jwt.sign({ sub: u.id, tv: u.tokenVersion || 0 }, env.jwtSecret, { expiresIn: '7d' });
function requireAuth(env, repo) {
  return ah(async (req, res, next) => {
    const t = req.cookies && req.cookies[COOKIE];
    if (!t) throw new ApiError(401, 'unauthenticated', 'Please log in');
    let p; try { p = jwt.verify(t, env.jwtSecret); } catch { throw new ApiError(401, 'unauthenticated', 'Session expired or invalid'); }
    const u = await repo.users.findById(p.sub);
    if (!u || (u.tokenVersion || 0) !== p.tv) throw new ApiError(401, 'unauthenticated', 'Session expired or invalid');
    req.user = u; next();
  });
}
// CSRF defence for cookie auth: state-changing requests must carry a custom header (plain cross-site forms cannot send it).
function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'archnova') return next(new ApiError(403, 'csrf', 'Missing X-Requested-With header'));
  next();
}
module.exports = { COOKIE, cookieOpts, sign, requireAuth, csrf };
