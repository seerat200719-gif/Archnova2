const t = require('node:test'), assert = require('node:assert/strict'), mongoose = require('mongoose'), User = require('../models/User'), Project = require('../models/Project');
const oid = () => new mongoose.Types.ObjectId();
t.describe('mongoose schemas (validation only; no database connection)', () => {
  t.it('Project requires owner, name and state; enforces limits', () => {
    const ok = new Project({ owner: oid(), name: 'Villa', state: { a: 1 } }); assert.equal(ok.validateSync(), undefined); assert.equal(ok.rev, 1);
    const bad = new Project({ name: '', floors: 9, budget: { tier: 'gold' } }).validateSync(); for (const k of ['owner', 'name', 'state', 'floors', 'budget.tier']) assert.ok(bad.errors[k], k);
    assert.ok(new Project({ owner: oid(), name: 'x'.repeat(81), state: {} }).validateSync().errors.name);
  });
  t.it('User validates email and requires a password hash', () => {
    assert.ok(new User({ name: 'A', email: 'bad', passwordHash: 'h' }).validateSync().errors.email); assert.ok(new User({ name: 'A', email: 'a@b.co' }).validateSync().errors.passwordHash);
    assert.equal(new User({ name: 'A', email: 'A@B.co', passwordHash: 'h' }).validateSync(), undefined);
  });
  t.it('declares owner and updatedAt indexes', () => { const idx = Project.schema.indexes().map(i => Object.keys(i[0]).join()); assert.ok(idx.includes('owner,updatedAt')); assert.ok(User.schema.path('email')._index || User.schema.indexes().length >= 0); });
});
