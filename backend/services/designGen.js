const { ApiError } = require('../middleware/error'), { validateDesign, ROOM_TYPES, FURN_TYPES, STYLES } = require('../validators/design');
const SYSTEM = `You are an architectural layout assistant. Reply with ONE JSON object only (no prose, no markdown).
Schema (schemaVersion 1, units metres): {"schemaVersion":1,"units":"m","plot":{"width":W,"length":L},"floors":1-2 (max 2),"style":one of ${STYLES.join('|')},
"rooms":[{"id":"snake_case","name":"..","type":one of ${ROOM_TYPES.join('|')},"floor":0..floors-1,"x":..,"z":..,"w":..,"d":..,"features":"..","furniture":[{"type":one of ${FURN_TYPES.join('|')},"fx":0.05-0.95,"fz":0.05-0.95,"rot":0|90|180|270}]}],
"doors":[{"floor":n,"x":..,"z":..,"width":0.8-2.5}],"windows":[{"roomId":"..","wall":"N|E|S|W","offset":0.1-0.9,"width":0.6-3}],
"stairs":{"fromRoom":"id","toRoom":"id"} (required if floors>1),"materials":{"wall":"#rrggbb","floor":"#rrggbb","furniture":"#rrggbb","exterior":"#rrggbb","floorMaterial":wood|marble|concrete|brick|glass|tiles},
"roof":{"type":flat|gable|mono},"lighting":{"timeOfDay":day|morning|golden|sunset|night,"windowWidth":0.8-3},"budget":{"tier":basic|standard|premium,"note":".."},"explanation":"..","constraints":[".."]}
Coordinates: x runs east 0..width, z runs south 0..length; the entrance/front facade is at z=length, the rear at z=0. Rooms are axis-aligned rectangles that must not overlap on a floor and must stay inside the plot.
A door must lie exactly on a shared wall between two rooms (its point on both rooms' edges, at least 0.3 m from corners), or on a room edge on the plot boundary for an entrance (include at least one). Windows only on exterior walls (N: z=0, S: z=length, W: x=0, E: x=width).
Convert feet to metres (1 ft = 0.3048 m). Do not claim structural or building-code compliance.`;
function extractJson(t) {
  const s = t.indexOf('{'), e = t.lastIndexOf('}'); if (s < 0 || e <= s) throw new Error('no JSON object found');
  return JSON.parse(t.slice(s, e + 1));
}
async function run(ai, userMsg) {
  let msg = userMsg, errors = [];
  for (let attempt = 1; attempt <= 2; attempt++) { // one regeneration with validation feedback
    let raw; try { raw = extractJson(await ai.complete(SYSTEM, msg)); } catch (e) { if (e instanceof ApiError) throw e; errors = ['response was not valid JSON']; msg = `${userMsg}\n\nYour previous reply was not valid JSON. Reply with the JSON object only.`; continue; }
    const v = validateDesign(raw);
    if (v.ok) return { design: v.design, warnings: v.warnings, repairs: v.repairs, attempts: attempt };
    errors = v.errors; msg = `${userMsg}\n\nYour previous JSON failed validation: ${errors.slice(0, 10).join('; ')}. Return the corrected full JSON only.`;
  }
  throw new ApiError(422, 'invalid_ai_design', 'The AI could not produce a valid design. Your current design was not changed.', errors.slice(0, 10));
}
const generate = (ai, prompt) => run(ai, `Design a house for this request:\n${prompt}`);
async function modify(ai, design, instruction) {
  const r = await run(ai, `Current design JSON:\n${JSON.stringify(design)}\n\nApply this change and keep everything unrelated exactly as it is:\n${instruction}`);
  return { ...r, diff: diff(design, r.design) };
}
function diff(a, b) {
  const A = new Map(a.rooms.map(r => [r.id, r])), B = new Map(b.rooms.map(r => [r.id, r])), ch = [];
  for (const [id, r] of B) { const o = A.get(id); if (!o) ch.push({ room: id, change: 'added' }); else if (['x', 'z', 'w', 'd', 'floor'].some(k => o[k] !== r[k])) ch.push({ room: id, change: 'resized_or_moved' }); }
  for (const id of A.keys()) if (!B.has(id)) ch.push({ room: id, change: 'removed' });
  for (const k of ['style', 'floors']) if (a[k] !== b[k]) ch.push({ field: k, from: a[k], to: b[k] });
  if (JSON.stringify(a.materials) !== JSON.stringify(b.materials)) ch.push({ field: 'materials' });
  return ch;
}
async function explain(ai, design, question) {
  return ai.complete('You explain house layouts to a layperson in under 200 words, grounded only in the JSON given. Mention that this is a concept layout, not a structurally verified or code-compliant plan.', `Design JSON:\n${JSON.stringify(design)}\n\nQuestion: ${question || 'Explain the layout choices.'}`, { maxTokens: 700 });
}
module.exports = { generate, modify, explain, diff, extractJson };
