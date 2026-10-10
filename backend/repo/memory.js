// In-memory repository. NOT persistent. Used by automated tests and by explicit DB_MODE=memory (local trial only).
const crypto = require('crypto');
const id = () => crypto.randomBytes(12).toString('hex'), clone = o => JSON.parse(JSON.stringify(o));
const err = code => Object.assign(new Error(code), { code });
module.exports = function memoryRepo() {
  const U = new Map(), P = new Map();
  return {
    mode: 'memory', async connect() {}, async close() {}, ready: () => true,
    users: {
      async create(u) { if ([...U.values()].some(x => x.email === u.email.toLowerCase())) throw err('DUPLICATE'); const o = { id: id(), tokenVersion: 0, createdAt: new Date(), ...u, email: u.email.toLowerCase() }; U.set(o.id, o); const { passwordHash, ...pub } = o; return pub; },
      async findByEmail(e) { const u = [...U.values()].find(x => x.email === String(e).toLowerCase()); return u ? { ...u } : null; },
      async findById(i) { const u = U.get(i); if (!u) return null; const { passwordHash, ...pub } = u; return { ...pub }; },
      async bumpTokenVersion(i) { const u = U.get(i); if (u) u.tokenVersion++; },
    },
    projects: {
      async create(owner, data) { const now = new Date(), o = { ...clone(data), id: id(), owner, rev: 1, schemaVersion: 1, createdAt: now, updatedAt: now }; P.set(o.id, o); return clone(o); },
      async list(owner, { q, limit = 50, skip = 0 } = {}) { return [...P.values()].filter(p => p.owner === owner && (!q || p.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.updatedAt - a.updatedAt).slice(skip, skip + limit).map(({ state, design, ...s }) => clone(s)); },
      async get(i, owner) { const p = P.get(i); return p && p.owner === owner ? clone(p) : null; },
      async update(i, owner, rev, patch) { const p = P.get(i); if (!p || p.owner !== owner) return null; if (p.rev !== rev) throw err('CONFLICT'); Object.assign(p, clone(patch), { rev: p.rev + 1, updatedAt: new Date() }); return clone(p); },
      async delete(i, owner) { const p = P.get(i); if (!p || p.owner !== owner) return false; P.delete(i); return true; },
    },
  };
};
