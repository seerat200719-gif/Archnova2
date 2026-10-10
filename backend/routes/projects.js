const express = require('express'), V = require('../validators/api'), { validateDesign } = require('../validators/design');
const { ApiError, ah } = require('../middleware/error');
module.exports = (env, repo, auth) => {
  const r = express.Router(); r.use(auth);
  const id = req => { const p = V.objectId.safeParse(req.params.id); if (!p.success) throw new ApiError(400, 'invalid_id', 'Invalid project id'); return p.data; };
  const checkDesign = d => { if (!d) return; const v = validateDesign(d); if (!v.ok) throw new ApiError(422, 'invalid_design', 'Design failed validation', v.errors); };
  const derive = b => ({ ...(b.state ? { style: b.state.style || (b.design && b.design.style) || '', floors: b.state.floors || (b.design && b.design.floors) || 2 } : {}) });
  const full = p => ({ ok: true, project: p }), conflict = e => { if (e.code === 'CONFLICT') throw new ApiError(409, 'revision_conflict', 'This project was changed elsewhere. Reload it before saving.'); throw e; };
  r.post('/', ah(async (req, res) => { const b = V.projectCreate.parse(req.body); checkDesign(b.design); res.status(201).json(full(await repo.projects.create(req.user.id, { ...b, ...derive(b) }))); }));
  r.post('/import', ah(async (req, res) => { const e = V.envelope.parse(req.body), b = e.project; checkDesign(b.design); res.status(201).json(full(await repo.projects.create(req.user.id, { ...b, ...derive(b) }))); }));
  // Backup / restore all of the user's projects (thumbnails excluded to keep files small)
  r.get('/backup', ah(async (req, res) => {
    const list = await repo.projects.list(req.user.id, { limit: 50 }), projects = [];
    for (const s of list) { const p = await repo.projects.get(s.id, req.user.id); if (p) projects.push({ name: p.name, description: p.description || '', state: p.state, design: p.design || null }); }
    res.set('Content-Disposition', 'attachment; filename="archnova-backup.json"').json({ format: 'archnova-backup', schemaVersion: 1, exportedAt: new Date().toISOString(), projects: projects.length ? projects : [] });
  }));
  r.post('/restore', ah(async (req, res) => {
    const { parseImport } = require('./export'); if (!req.body || req.body.format !== 'archnova-backup') throw new ApiError(400, 'unsupported_format', 'Expected an archnova-backup file');
    const { projects } = parseImport(req.body), created = [];
    for (const b of projects) created.push((await repo.projects.create(req.user.id, { ...b, ...derive(b) })).id);
    res.status(201).json({ ok: true, created: created.length, ids: created });
  }));
  r.get('/', ah(async (req, res) => { const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 60) : ''; res.json({ ok: true, projects: await repo.projects.list(req.user.id, { q, limit: Math.min(+req.query.limit || 50, 100), skip: Math.max(+req.query.skip || 0, 0) }) }); }));
  r.get('/:id', ah(async (req, res) => { const p = await repo.projects.get(id(req), req.user.id); if (!p) throw new ApiError(404, 'not_found', 'Project not found'); res.json(full(p)); }));
  const upd = schema => ah(async (req, res) => {
    const b = schema.parse(req.body), { rev, ...patch } = b; checkDesign(patch.design);
    let p; try { p = await repo.projects.update(id(req), req.user.id, rev, { ...patch, ...derive(patch) }); } catch (e) { conflict(e); }
    if (!p) throw new ApiError(404, 'not_found', 'Project not found'); res.json(full(p));
  });
  r.put('/:id', upd(V.projectPut)); r.patch('/:id', upd(V.projectPatch));
  r.delete('/:id', ah(async (req, res) => { if (!(await repo.projects.delete(id(req), req.user.id))) throw new ApiError(404, 'not_found', 'Project not found'); res.json({ ok: true }); }));
  r.post('/:id/duplicate', ah(async (req, res) => {
    const p = await repo.projects.get(id(req), req.user.id); if (!p) throw new ApiError(404, 'not_found', 'Project not found');
    const { id: _i, owner, rev, createdAt, updatedAt, schemaVersion, ...rest } = p;
    res.status(201).json(full(await repo.projects.create(req.user.id, { ...rest, name: `${p.name} (copy)`.slice(0, 80) })));
  }));
  r.get('/:id/export', ah(async (req, res) => {
    const p = await repo.projects.get(id(req), req.user.id); if (!p) throw new ApiError(404, 'not_found', 'Project not found');
    const { name, description, state, design, ai, budget, thumbnail } = p, body = { format: 'archnova-project', schemaVersion: 1, exportedAt: new Date().toISOString(), app: 'ArchNova', project: { name, description, state, design, ...(ai ? { ai: JSON.parse(JSON.stringify(ai)) } : {}), ...(budget ? { budget } : {}), ...(thumbnail ? { thumbnail } : {}) } };
    res.set('Content-Disposition', `attachment; filename="${name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'project'}.archnova.json"`).json(body);
  }));
  return r;
};
