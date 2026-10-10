// Normalised plan sent by the browser for exports (works for template houses and AI layouts alike).
const { z } = require('zod'), { FURN_TYPES } = require('./design'), V = require('./api');
const n = (a, b) => z.number().finite().min(a).max(b), hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const room = z.object({ id: z.string().max(31), name: z.string().trim().min(1).max(40), type: z.string().max(20).default('room'), floor: z.number().int().min(0).max(1), x: n(0, 60), z: n(0, 60), w: n(0.3, 60), d: n(0.3, 60),
  furniture: z.array(z.object({ type: z.enum(FURN_TYPES), fx: n(0, 1), fz: n(0, 1), rot: n(0, 360).default(0) }).strict()).max(12).default([]) }).strict();
const plan = z.object({
  name: z.string().trim().min(1).max(80), style: z.string().max(40).default(''), units: z.literal('m'), plot: z.object({ width: n(3, 60), length: n(3, 60) }).strict(), floors: z.number().int().min(1).max(2),
  rooms: z.array(room).min(1).max(40),
  doors: z.array(z.object({ floor: z.number().int().min(0).max(1), x: n(0, 60), z: n(0, 60), width: n(0.6, 3).default(1), hz: z.boolean().default(false) }).strict()).max(120),
  windows: z.array(z.object({ floor: z.number().int().min(0).max(1), hor: z.boolean(), t: n(0, 60), c: n(0, 60), width: n(0.4, 4) }).strict()).max(200).default([]),
  stairs: z.object({ x: n(0, 60), z: n(0, 60), w: n(0.3, 20), d: n(0.3, 20) }).strict().optional(),
  materials: z.object({ wall: hex, floor: hex, furniture: hex, exterior: hex, floorMaterial: z.enum(['wood', 'marble', 'concrete', 'brick', 'glass', 'tiles']) }).strict(),
  budgetTier: z.enum(['basic', 'standard', 'premium']).default('standard'),
}).strict();
const planReq = z.object({ plan, floor: z.union([z.literal('all'), z.number().int().min(0).max(1)]).optional() }).strict();
const backup = z.object({ format: z.literal('archnova-backup'), schemaVersion: z.literal(1), exportedAt: z.string().max(40), projects: z.array(V.projectCreate).min(1).max(50) }).strict();
module.exports = { plan, planReq, backup };
