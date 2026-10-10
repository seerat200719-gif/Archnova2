const request = require('supertest'), { load } = require('../config/env'), { createApp } = require('../app'), memory = require('../repo/memory'), { createAi } = require('../services/ai');
const H = { 'X-Requested-With': 'archnova' };
const env = (o = {}) => load({ NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), DB_MODE: 'memory', BCRYPT_ROUNDS: '4', ...o });
const fakeAi = replies => { let i = 0; const calls = []; return { configured: true, provider: 'fake', model: 'fake-1', calls, complete: async (s, u) => { calls.push(u); const r = replies[Math.min(i++, replies.length - 1)]; if (r instanceof Error) throw r; return typeof r === 'string' ? r : JSON.stringify(r); } }; };
const make = (o = {}) => { const e = o.env || env(); return { app: createApp({ env: e, repo: memory(), ai: o.ai || createAi(e), fetchImpl: o.fetchImpl }), env: e }; };
async function user(app, name = 'Asha', email = `${name.toLowerCase()}@example.com`) { const a = request.agent(app); const r = await a.post('/api/auth/register').set(H).send({ name, email, password: 'password123' }); return { a, id: r.body.user.id, cookie: r.headers['set-cookie'][0].split(';')[0] }; }
const design = () => ({ schemaVersion: 1, units: 'm', plot: { width: 10, length: 8 }, floors: 2, style: 'Modern',
  rooms: [
    { id: 'living', name: 'Living Room', type: 'living', floor: 0, x: 0, z: 0, w: 6, d: 5, furniture: [{ type: 'sofa', fx: 0.5, fz: 0.7, rot: 180 }] },
    { id: 'kitchen', name: 'Kitchen', type: 'kitchen', floor: 0, x: 6, z: 0, w: 4, d: 5, furniture: [] },
    { id: 'hall', name: 'Hall', type: 'hall', floor: 0, x: 0, z: 5, w: 3, d: 3, furniture: [] },
    { id: 'bath1', name: 'Bathroom', type: 'bathroom', floor: 0, x: 3, z: 5, w: 2, d: 3, furniture: [] },
    { id: 'bed1', name: 'Bedroom 1', type: 'bedroom', floor: 0, x: 5, z: 5, w: 5, d: 3, furniture: [] },
    { id: 'master', name: 'Master Bedroom', type: 'bedroom', floor: 1, x: 0, z: 0, w: 5, d: 5, furniture: [] },
    { id: 'bed2', name: 'Bedroom 2', type: 'bedroom', floor: 1, x: 5, z: 0, w: 5, d: 5, furniture: [] },
    { id: 'landing', name: 'Landing', type: 'landing', floor: 1, x: 0, z: 5, w: 3, d: 3, furniture: [] },
    { id: 'bath2', name: 'Bathroom', type: 'bathroom', floor: 1, x: 3, z: 5, w: 2, d: 3, furniture: [] },
    { id: 'balcony', name: 'Balcony', type: 'balcony', floor: 1, x: 5, z: 5, w: 5, d: 3, furniture: [] }],
  doors: [{ floor: 0, x: 1.5, z: 8, width: 1.1 }, { floor: 0, x: 1.5, z: 5 }, { floor: 0, x: 6, z: 2.5 }, { floor: 0, x: 3, z: 6.5 }, { floor: 0, x: 7.5, z: 5 }, { floor: 1, x: 1.5, z: 5 }, { floor: 1, x: 4, z: 5 }, { floor: 1, x: 5, z: 2.5 }, { floor: 1, x: 7.5, z: 5 }],
  windows: [{ roomId: 'living', wall: 'N', offset: 0.5, width: 2 }, { roomId: 'living', wall: 'W', offset: 0.5, width: 1.5 }, { roomId: 'master', wall: 'N', offset: 0.5, width: 1.8 }, { roomId: 'master', wall: 'W', offset: 0.5, width: 1.5 }],
  stairs: { fromRoom: 'hall', toRoom: 'landing' },
  materials: { wall: '#ece6da', floor: '#b08d62', furniture: '#6b6f76', exterior: '#d8d3ca', floorMaterial: 'wood' },
  roof: { type: 'flat' }, lighting: { timeOfDay: 'day', windowWidth: 1.6 }, budget: { tier: 'standard' }, explanation: 'Test layout.', constraints: [] });
const state = () => ({ name: 'Nova', style: 'Modern', beds: 4, floors: 2, mat: 'wood', wall: '#ece6da', floor: '#b08d62', furn: '#6b6f76', ext: '#d8d3ca', win: 1.6, tod: 'golden', sun: 0.55 });
module.exports = { request, H, env, fakeAi, make, user, design, state };
// Plan payload as the browser sends it (rooms/doors/windows already resolved to wall coordinates).
module.exports.plan = () => { const d = design(), hz = o => d.rooms.some(r => r.floor === o.floor && (Math.abs(o.z - r.z) < .06 || Math.abs(o.z - r.z - r.d) < .06) && o.x > r.x + .2 && o.x < r.x + r.w - .2);
  return { name: 'Nova <Villa>', style: 'Modern', units: 'm', plot: d.plot, floors: 2, rooms: d.rooms.map(r => ({ id: r.id, name: r.name, type: r.type, floor: r.floor, x: r.x, z: r.z, w: r.w, d: r.d, furniture: r.furniture })),
    doors: d.doors.map(o => ({ floor: o.floor, x: o.x, z: o.z, width: o.width || 1, hz: hz(o) })), windows: [{ floor: 0, hor: true, t: 3, c: 0, width: 2 }, { floor: 0, hor: false, t: 2.5, c: 0, width: 1.5 }, { floor: 1, hor: true, t: 2.5, c: 0, width: 1.8 }],
    stairs: { x: 0.9, z: 5.2, w: 1.2, d: 2.6 }, materials: d.materials ? d.materials : { wall: '#ece6da', floor: '#b08d62', furniture: '#6b6f76', exterior: '#d8d3ca', floorMaterial: 'wood' }, budgetTier: 'standard' }; };
module.exports.hexOf = s => Buffer.from(s, 'latin1').toString('hex');
