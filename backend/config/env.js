const path = require('path'), crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
// Validates configuration. Never log the returned object (it contains secrets).
function load(src = process.env) {
  const prod = src.NODE_ENV === 'production';
  const e = {
    prod, test: src.NODE_ENV === 'test', port: +src.PORT || 3000,
    mongoUri: src.MONGODB_URI || '', dbMode: src.DB_MODE || (src.MONGODB_URI ? 'mongo' : 'none'),
    jwtSecret: src.JWT_SECRET || '', clientOrigins: (src.CLIENT_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean),
    aiProvider: src.AI_PROVIDER || 'anthropic', aiKey: src.ANTHROPIC_API_KEY || '', aiModel: src.AI_MODEL || 'claude-sonnet-5-5',
    aiTimeoutMs: +src.AI_TIMEOUT_MS || 45000, serpKey: src.SERPAPI_API_KEY || '',
    bcryptRounds: +src.BCRYPT_ROUNDS || 10, trustProxy: src.TRUST_PROXY === '1',
  };
  if (!e.jwtSecret || e.jwtSecret.length < 32) {
    if (prod) throw new Error('JWT_SECRET must be set (32+ characters) in production');
    e.jwtSecret = crypto.randomBytes(32).toString('hex'); e.ephemeralSecret = true; // dev only: sessions reset on restart
  }
  if (!['mongo', 'memory', 'none'].includes(e.dbMode)) throw new Error('DB_MODE must be mongo, memory or none');
  if (prod && e.dbMode !== 'mongo') throw new Error('Production requires DB_MODE=mongo with MONGODB_URI');
  if (e.dbMode === 'mongo' && !e.mongoUri) throw new Error('MONGODB_URI is required when DB_MODE=mongo');
  return e;
}
module.exports = { load };
