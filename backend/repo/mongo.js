const mongoose = require('mongoose'), User = require('../models/User'), Project = require('../models/Project');
const dto = d => { if (!d) return null; const o = d.toObject ? d.toObject() : { ...d }; o.id = String(o._id); delete o._id; delete o.__v; if (o.owner) o.owner = String(o.owner); return o; };
const err = code => Object.assign(new Error(code), { code });
module.exports = function mongoRepo(uri) {
  return {
    mode: 'mongo',
    async connect() { await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 }); },
    async close() { await mongoose.disconnect(); },
    ready: () => mongoose.connection.readyState === 1,
    users: {
      async create(u) { try { return dto(await User.create(u)); } catch (e) { if (e && e.code === 11000) throw err('DUPLICATE'); throw e; } },
      async findByEmail(email) { const d = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash'); return d ? { ...dto(d), passwordHash: d.passwordHash } : null; },
      async findById(id) { return dto(await User.findById(id)); },
      async bumpTokenVersion(id) { await User.updateOne({ _id: id }, { $inc: { tokenVersion: 1 } }); },
    },
    projects: {
      async create(owner, data) { return dto(await Project.create({ ...data, owner })); },
      async list(owner, { q, limit = 50, skip = 0 } = {}) {
        const f = { owner }; if (q) f.name = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        return (await Project.find(f).select('-state -design').sort({ updatedAt: -1 }).skip(skip).limit(limit)).map(dto);
      },
      async get(id, owner) { return dto(await Project.findOne({ _id: id, owner })); },
      async update(id, owner, rev, patch) {
        const d = await Project.findOneAndUpdate({ _id: id, owner, rev }, { $set: patch, $inc: { rev: 1 } }, { new: true, runValidators: true });
        if (d) return dto(d);
        if (await Project.exists({ _id: id, owner })) throw err('CONFLICT');
        return null;
      },
      async delete(id, owner) { return !!(await Project.findOneAndDelete({ _id: id, owner })); },
    },
  };
};
