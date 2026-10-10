module.exports = function createRepo(env) {
  if (env.dbMode === 'mongo') return require('./mongo')(env.mongoUri);
  if (env.dbMode === 'memory') return require('./memory')();
  return null; // db not configured: data routes answer 503 db_unavailable
};
