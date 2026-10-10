const express = require('express'), V = require('../validators/export'), PV = require('../validators/api'), { validateDesign } = require('../validators/design'), X = require('../services/exporter');
const { ApiError, ah } = require('../middleware/error'), { z } = require('zod');
const safe = n => String(n).replace(/[^\w.-]+/g, '_').slice(0, 60) || 'archnova';
// Validates a project envelope or backup file and returns normalised data (no database needed, nothing is saved).
function parseImport(payload) {
  if (!payload || typeof payload !== 'object') throw new ApiError(400, 'invalid_file', 'File is not an ArchNova export');
  let projects;
  if (payload.format === 'archnova-backup') projects = V.backup.parse(payload).projects;
  else if (payload.format === 'archnova-project') projects = [PV.envelope.parse(payload).project];
  else throw new ApiError(400, 'unsupported_format', 'Unknown file format. Expected an ArchNova project export or backup (schemaVersion 1).');
  projects.forEach((p, i) => { if (p.design) { const v = validateDesign(p.design); if (!v.ok) throw new ApiError(422, 'invalid_design', `Project ${i + 1} has an invalid design`, v.errors); } });
  return { kind: payload.format === 'archnova-backup' ? 'backup' : 'project', projects };
}
module.exports = (limiter) => {
  const r = express.Router(); r.use(limiter);
  const send = (res, type, name, body) => res.set({ 'Content-Type': type, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store' }).send(body);
  r.post('/floorplan.svg', ah(async (req, res) => { const { plan, floor } = V.planReq.parse(req.body), fl = floor === undefined || floor === 'all' ? 0 : floor; send(res, 'image/svg+xml', `${safe(plan.name)}-${fl ? 'first' : 'ground'}-floor.svg`, X.planSvg(plan, Math.min(fl, plan.floors - 1))); }));
  r.post('/floorplan.pdf', ah(async (req, res) => { const { plan } = V.planReq.parse(req.body); send(res, 'application/pdf', safe(plan.name) + '-floorplan.pdf', await X.floorPlanPdf(plan)); }));
  r.post('/summary.pdf', ah(async (req, res) => { const { plan } = V.planReq.parse(req.body); send(res, 'application/pdf', safe(plan.name) + '-summary.pdf', await X.summaryPdf(plan)); }));
  r.post('/validate-import', ah(async (req, res) => { const out = parseImport(req.body); res.json({ ok: true, ...out }); }));
  return r;
};
module.exports.parseImport = parseImport;
