const { ZodError } = require('zod');
class ApiError extends Error { constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; } }
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const notFound = (req, res) => res.status(404).json({ ok: false, error: 'not_found', message: 'Route not found' });
function errorHandler(env) {
  return (e, req, res, next) => {
    if (res.headersSent) return next(e);
    if (e instanceof ZodError) return res.status(400).json({ ok: false, error: 'validation_error', message: 'Invalid input', details: e.issues.slice(0, 20).map(i => ({ path: i.path.join('.'), message: i.message })) });
    if (e instanceof ApiError) return res.status(e.status).json({ ok: false, error: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) });
    if (e.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'payload_too_large', message: 'Request body too large' });
    if (e.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'bad_json', message: 'Malformed JSON body' });
    if (!env.test) console.error('Unhandled error:', e.name, e.message); // message only: no stack, body or headers
    res.status(500).json({ ok: false, error: 'internal_error', message: 'Something went wrong' });
  };
}
module.exports = { ApiError, ah, notFound, errorHandler };
