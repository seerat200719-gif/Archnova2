const { z } = require('zod'), { designSchema } = require('./design');
const email = z.string().trim().toLowerCase().email().max(254);
const register = z.object({ name: z.string().trim().min(1).max(60), email, password: z.string().min(8).max(128) }).strict();
const login = z.object({ email, password: z.string().min(1).max(128) }).strict();
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/), n = (a, b) => z.number().finite().min(a).max(b);
// Parameters understood by the current Three.js template renderer (js/app.js `D`).
const state = z.object({
  name: z.string().max(80).optional(), style: z.string().max(40).optional(), beds: n(1, 4).optional(), baths: n(1, 4).optional(), floors: n(1, 2).optional(),
  balcony: n(0, 1).optional(), garage: n(0, 1).optional(), garden: n(0, 1).optional(), lw: n(4, 8).optional(), kw: n(2, 5).optional(), win: n(0.8, 3).optional(),
  eco: n(0, 1).optional(), mat: z.enum(['wood', 'marble', 'concrete', 'brick', 'glass', 'tiles']).optional(), wall: hex.optional(), floor: hex.optional(), furn: hex.optional(), ext: hex.optional(),
  sun: n(0, 2).optional(), tod: z.string().max(12).nullable().optional(), fu: z.union([z.boolean(), n(0, 1)]).optional(), solar: z.union([z.boolean(), n(0, 1)]).optional(),
  q: n(0, 2).optional(), rg: n(0, 2).optional(), hero: n(0, 1).optional(),
  fx: z.record(z.string().max(30), z.array(z.tuple([z.string().max(12), n(0, 1), n(0, 1), n(0, 360)])).max(12)).optional(),
  refs: z.array(z.object({ title: z.string().max(200), source: z.string().max(100), link: z.string().max(500), thumb: z.string().max(10).optional() })).max(20).optional(),
}).strict();
const thumb = z.string().max(200000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);
const meta = { name: z.string().trim().min(1).max(80), description: z.string().max(500), state, design: designSchema.nullable(), thumbnail: thumb,
  ai: z.object({ prompt: z.string().max(2000), provider: z.string().max(40).optional(), model: z.string().max(80).optional(), generatedAt: z.coerce.date().optional() }).strict(),
  budget: z.object({ tier: z.enum(['basic', 'standard', 'premium']).optional(), rate: n(0, 100000).optional() }).strict() };
const projectCreate = z.object({ name: meta.name, description: meta.description.optional(), state: meta.state, design: meta.design.optional(), thumbnail: meta.thumbnail.optional(), ai: meta.ai.optional(), budget: meta.budget.optional() }).strict();
const projectPut = projectCreate.extend({ rev: z.number().int().min(1) });
const projectPatch = z.object({ rev: z.number().int().min(1), name: meta.name.optional(), description: meta.description.optional(), state: meta.state.optional(), design: meta.design.optional(), thumbnail: meta.thumbnail.optional(), ai: meta.ai.optional(), budget: meta.budget.optional() }).strict();
const envelope = z.object({ format: z.literal('archnova-project'), schemaVersion: z.literal(1), exportedAt: z.string().max(40), app: z.string().max(20).optional(), project: projectCreate }).strict();
const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const aiGen = z.object({ prompt: z.string().trim().min(10).max(1500) }).strict();
const aiMod = z.object({ design: designSchema, instruction: z.string().trim().min(3).max(500) }).strict();
const aiExplain = z.object({ design: designSchema, question: z.string().trim().max(500).optional() }).strict();
const costReq = z.object({ design: designSchema, rates: z.object({ baseRate: n(500, 20000).optional(), quality: z.enum(['basic', 'standard', 'premium']).optional(), region: z.enum(['tier3', 'tier2', 'metro']).optional() }).strict().optional(), narrate: z.boolean().optional() }).strict();
const analyzeReq = z.object({ design: designSchema, narrate: z.boolean().optional() }).strict();
module.exports = { register, login, state, projectCreate, projectPut, projectPatch, envelope, objectId, aiGen, aiMod, aiExplain, costReq, analyzeReq };
