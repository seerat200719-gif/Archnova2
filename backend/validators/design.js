// Versioned design spec (schemaVersion 1). Coordinate system (metres):
//   x = east (0..plot.width), z = south (0..plot.length). Entrance/front facade is at z = plot.length; rear is z = 0.
//   floor 0 = ground. Rooms are axis-aligned rectangles {x,z,w,d} (top-left corner + size).
const { z } = require('zod');
const ROOM_TYPES = ['living', 'dining', 'kitchen', 'bedroom', 'bathroom', 'hall', 'stair', 'landing', 'study', 'utility', 'garage', 'balcony', 'terrace', 'store', 'pooja', 'office', 'guest'];
const FURN_TYPES = ['sofa', 'bed', 'table', 'counter', 'island', 'ward', 'tv', 'tub', 'wc', 'plant', 'car', 'desk', 'fridge', 'coffee'];
const STYLES = ['Modern', 'Contemporary', 'Modern Indian', 'Minimalist', 'Luxury', 'Scandinavian', 'Traditional', 'Industrial', 'Mediterranean', 'Sustainable'];
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const num = (a, b) => z.number().finite().min(a).max(b);
const furniture = z.object({ type: z.enum(FURN_TYPES), fx: num(0.05, 0.95), fz: num(0.05, 0.95), rot: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0) }).strict();
const room = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/), name: z.string().trim().min(1).max(40), type: z.enum(ROOM_TYPES),
  floor: z.number().int().min(0).max(1), x: num(0, 60), z: num(0, 60), w: num(0.5, 40), d: num(0.5, 40),
  features: z.string().max(160).optional(), furniture: z.array(furniture).max(12).default([]),
}).strict();
const door = z.object({ floor: z.number().int().min(0).max(1), x: num(0, 60), z: num(0, 60), width: num(0.6, 3).default(1) }).strict();
const win = z.object({ roomId: z.string(), wall: z.enum(['N', 'E', 'S', 'W']), offset: num(0.1, 0.9), width: num(0.5, 3) }).strict();
const designSchema = z.object({
  schemaVersion: z.literal(1), units: z.literal('m'),
  plot: z.object({ width: num(3, 40), length: num(3, 40) }).strict(),
  floors: z.number().int().min(1).max(2), style: z.string().trim().min(1).max(40),
  rooms: z.array(room).min(1).max(30), doors: z.array(door).max(80), windows: z.array(win).max(120).default([]),
  stairs: z.object({ fromRoom: z.string(), toRoom: z.string() }).strict().optional(),
  materials: z.object({ wall: hex, floor: hex, furniture: hex, exterior: hex, floorMaterial: z.enum(['wood', 'marble', 'concrete', 'brick', 'glass', 'tiles']) }).strict(),
  roof: z.object({ type: z.enum(['flat', 'gable', 'mono']) }).strict(),
  lighting: z.object({ timeOfDay: z.enum(['day', 'morning', 'golden', 'sunset', 'night']), windowWidth: num(0.8, 3) }).strict(),
  budget: z.object({ tier: z.enum(['basic', 'standard', 'premium']), note: z.string().max(200).optional() }).strict(),
  explanation: z.string().max(2000).default(''), constraints: z.array(z.string().max(200)).max(10).default([]),
}).strict();

const r2 = n => Math.round(n * 100) / 100;
const ovl = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.01 && Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z) > 0.01;
function sharedWall(a, b) {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oz = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z);
  if (Math.abs(a.x + a.w - b.x) < 0.02 || Math.abs(b.x + b.w - a.x) < 0.02) return Math.max(0, oz);
  if (Math.abs(a.z + a.d - b.z) < 0.02 || Math.abs(b.z + b.d - a.z) < 0.02) return Math.max(0, ox);
  return 0;
}
const onEdge = (r, x, zz) => {
  const nearX = Math.abs(x - r.x) < 0.05 || Math.abs(x - (r.x + r.w)) < 0.05, nearZ = Math.abs(zz - r.z) < 0.05 || Math.abs(zz - (r.z + r.d)) < 0.05;
  return (nearX && zz > r.z + 0.3 && zz < r.z + r.d - 0.3) || (nearZ && x > r.x + 0.3 && x < r.x + r.w - 0.3);
};
const onBoundary = (p, x, zz) => Math.abs(x) < 0.05 || Math.abs(x - p.width) < 0.05 || Math.abs(zz) < 0.05 || Math.abs(zz - p.length) < 0.05;

// Limited, safe repair: round numbers, clamp rooms into the plot, drop out-of-range furniture/duplicate ids.
function repair(d) {
  const repairs = [], seen = new Set();
  d.rooms = d.rooms.filter(r => { if (seen.has(r.id)) { repairs.push(`dropped duplicate room id ${r.id}`); return false; } seen.add(r.id); return true; });
  for (const r of d.rooms) {
    for (const k of ['x', 'z', 'w', 'd']) r[k] = r2(r[k]);
    if (r.x + r.w > d.plot.width + 0.01 && r.w <= d.plot.width) { r.x = r2(d.plot.width - r.w); repairs.push(`moved ${r.id} inside plot (x)`); }
    if (r.z + r.d > d.plot.length + 0.01 && r.d <= d.plot.length) { r.z = r2(d.plot.length - r.d); repairs.push(`moved ${r.id} inside plot (z)`); }
  }
  for (const o of d.doors) { o.x = r2(o.x); o.z = r2(o.z); }
  return repairs;
}
function geometry(d) {
  const errors = [], warnings = [], P = d.plot, byId = new Map(d.rooms.map(r => [r.id, r]));
  for (const r of d.rooms) {
    if (r.floor >= d.floors) errors.push(`room ${r.id}: floor ${r.floor} is outside 0..${d.floors - 1}`);
    if (r.x < -0.01 || r.z < -0.01 || r.x + r.w > P.width + 0.01 || r.z + r.d > P.length + 0.01) errors.push(`room ${r.id} extends outside the ${P.width}x${P.length} m plot`);
    if (Math.min(r.w, r.d) < 1.2 && !['balcony', 'terrace', 'stair', 'landing', 'store'].includes(r.type)) errors.push(`room ${r.id} is narrower than 1.2 m`);
  }
  for (let f = 0; f < d.floors; f++) {
    const rs = d.rooms.filter(r => r.floor === f);
    if (!rs.length) errors.push(`floor ${f} has no rooms`);
    for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) if (ovl(rs[i], rs[j])) errors.push(`rooms ${rs[i].id} and ${rs[j].id} overlap on floor ${f}`);
    const cover = rs.reduce((s, r) => s + r.w * r.d, 0) / (P.width * P.length);
    if (cover < 0.6) warnings.push(`floor ${f}: rooms cover only ${Math.round(cover * 100)}% of the plot`);
  }
  const links = new Map(d.rooms.map(r => [r.id, new Set()])); let entrance = [];
  d.doors.forEach((o, i) => {
    if (o.floor >= d.floors) return errors.push(`door ${i}: floor ${o.floor} is outside the building`);
    const rs = d.rooms.filter(r => r.floor === o.floor && onEdge(r, o.x, o.z));
    if (!rs.length) return errors.push(`door ${i} at (${o.x},${o.z}) is not on any room wall`);
    if (rs.length > 2) warnings.push(`door ${i} touches ${rs.length} rooms`);
    if (rs.length === 1) { if (onBoundary(P, o.x, o.z)) entrance.push(rs[0].id); else errors.push(`door ${i} opens into nothing (only room ${rs[0].id} adjoins it)`); }
    else { links.get(rs[0].id).add(rs[1].id); links.get(rs[1].id).add(rs[0].id); }
  });
  for (const w of d.windows) {
    const r = byId.get(w.roomId); if (!r) { errors.push(`window references unknown room ${w.roomId}`); continue; }
    const ext = { N: r.z < 0.05, S: Math.abs(r.z + r.d - P.length) < 0.05, W: r.x < 0.05, E: Math.abs(r.x + r.w - P.width) < 0.05 }[w.wall];
    if (!ext) errors.push(`window on ${w.wall} wall of ${w.roomId} is not on an exterior wall`);
    if (w.width > (['N', 'S'].includes(w.wall) ? r.w : r.d) * 0.9) errors.push(`window on ${w.roomId} ${w.wall} wall is wider than the wall`);
  }
  if (d.floors > 1) {
    if (!d.stairs) errors.push('multi-floor design needs "stairs"');
    else {
      const a = byId.get(d.stairs.fromRoom), b = byId.get(d.stairs.toRoom);
      if (!a || !b) errors.push('stairs reference unknown rooms'); else if (Math.abs(a.floor - b.floor) !== 1) errors.push('stairs must connect adjacent floors'); else { links.get(a.id).add(b.id); links.get(b.id).add(a.id); }
    }
  }
  if (!entrance.length) errors.push('no exterior entrance door (a door on the plot boundary)');
  else {
    const seen = new Set(entrance), q = [...entrance];
    while (q.length) for (const n of links.get(q.pop())) if (!seen.has(n)) { seen.add(n); q.push(n); }
    for (const r of d.rooms) if (!seen.has(r.id)) warnings.push(`room ${r.id} cannot be reached through doors from the entrance`);
  }
  return { errors, warnings };
}
// Single entry point used for AI output, project saves and imports.
function validateDesign(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, errors: ['design is not an object'], warnings: [], repairs: [] };
  if (JSON.stringify(raw).length > 60000) return { ok: false, errors: ['design is too large'], warnings: [], repairs: [] };
  const p = designSchema.safeParse(raw);
  if (!p.success) return { ok: false, errors: p.error.issues.slice(0, 15).map(i => `${i.path.join('.')}: ${i.message}`), warnings: [], repairs: [] };
  const design = JSON.parse(JSON.stringify(p.data)), repairs = repair(design), g = geometry(design);
  return { ok: !g.errors.length, design, errors: g.errors, warnings: g.warnings, repairs };
}
const area = d => d.rooms.reduce((s, r) => s + r.w * r.d, 0);
module.exports = { designSchema, validateDesign, geometry, sharedWall, onEdge, area, ROOM_TYPES, FURN_TYPES, STYLES };
