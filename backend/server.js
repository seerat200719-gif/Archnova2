const { load } = require('./config/env'), createRepo = require('./repo'), { createApp } = require('./app');
(async () => {
  const env = load(), repo = createRepo(env);
  if (env.ephemeralSecret) console.warn('JWT_SECRET not set: using a temporary secret (sessions reset on restart). Set it in .env.');
  if (env.dbMode === 'memory') console.warn('DB_MODE=memory: data is NOT persistent and is lost on restart. For local trial only.');
  if (!repo) console.warn('No database configured (set MONGODB_URI). Auth and projects return 503 until configured.');
  else try { await repo.connect(); console.log(`Database connected (${repo.mode})`); } catch (e) { console.error('Database connection failed:', e.message); if (env.prod) process.exit(1); }
  createApp({ env, repo: repo || null }).listen(env.port, () => console.log(`ArchNova on http://localhost:${env.port}`));
})();
