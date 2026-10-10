const path = require('path'), express = require('express'), helmet = require('helmet'), cors = require('cors'), morgan = require('morgan'), cookieParser = require('cookie-parser'), rateLimit = require('express-rate-limit');
const { csrf, requireAuth } = require('./middleware/auth'), { ApiError, ah, notFound, errorHandler } = require('./middleware/error');
const { createAi } = require('./services/ai'), inspire = require('./services/inspire');
function createApp({ env, repo, ai = createAi(env), fetchImpl = fetch }) {
  const app = express(), root = path.join(__dirname, '..');
  if (env.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net'], // inline handlers in index.html need 'unsafe-inline' until they are refactored
    styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'], fontSrc: ['https://fonts.gstatic.com'],
    scriptSrcAttr: ["'unsafe-inline'"], // helmet defaults to 'none', which blocks every inline onclick button in index.html
    imgSrc: ["'self'", 'data:', 'https:'], connectSrc: ["'self'"], frameAncestors: ["'self'"], objectSrc: ["'none'"] } } }));
  app.use(cors({ origin: (o, cb) => cb(null, !o || env.clientOrigins.includes(o)), credentials: true }));
  if (!env.test) app.use(morgan('tiny')); // method, URL, status only: never bodies or cookies
  app.use(express.json({ limit: '1mb' })); app.use(cookieParser()); app.use('/api', csrf);
  const lim = (windowMs, limit) => rateLimit({ windowMs, limit, standardHeaders: true, legacyHeaders: false, skip: () => env.test, handler: (q, s) => s.status(429).json({ ok: false, error: 'rate_limited', message: 'Too many requests, slow down' }) });
  app.use('/api', lim(15 * 60e3, 600));
  app.get('/api/health', (q, s) => s.json({ ok: true, status: 'up', db: !repo ? 'not_configured' : repo.ready() ? repo.mode : 'disconnected', ai: ai.configured ? 'configured' : 'not_configured', search: env.serpKey ? 'configured' : 'not_configured' }));
  const needDb = (q, s, n) => (!repo || !repo.ready()) ? n(new ApiError(503, 'db_unavailable', 'Database is not available. Check MONGODB_URI and your network.')) : n();
  app.use('/api/auth', needDb); app.use('/api/projects', needDb);
  app.use('/api/export', require('./routes/export')(lim(60 * 60e3, 60)));
  if (repo) {
    const auth = requireAuth(env, repo);
    app.use('/api/auth', require('./routes/auth')(env, repo, lim(15 * 60e3, 30)));
    app.use('/api/projects', require('./routes/projects')(env, repo, auth));
    app.use('/api/ai', needDb, require('./routes/ai')(env, auth, ai, lim(60 * 60e3, 30)));
  }
  app.get('/api/inspire', ah(async (req, res) => { const results = await inspire.search(req.query.q, { key: env.serpKey, fetchImpl }); res.json({ ok: true, live: true, results }); }));
  app.get('/', (q, s) => s.sendFile(path.join(root, 'index.html')));
  app.use('/css', express.static(path.join(root, 'css'))); app.use('/js', express.static(path.join(root, 'js'))); // only these folders are public
  app.use(notFound); app.use(errorHandler(env));
  return app;
}
module.exports = { createApp };
