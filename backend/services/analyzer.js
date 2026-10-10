// Deterministic design heuristics (rules of thumb, not simulations or code-compliance checks).
const { sharedWall, area } = require('../validators/design');
const kind = { M: 'measured', A: 'approximate', S: 'suggestion' };
function analyze(d) {
  const out = [], push = (id, title, k, text, value) => out.push({ id, title, kind: kind[k], text, ...(value !== undefined ? { value } : {}) });
  const tot = area(d), circ = d.rooms.filter(r => ['hall', 'stair', 'landing'].includes(r.type)).reduce((s, r) => s + r.w * r.d, 0);
  push('utilization', 'Space utilization', 'M', `${Math.round(100 * (1 - circ / tot))}% of room area is usable rooms; ${Math.round(100 * circ / tot)}% is circulation (halls, stairs, landings).`, Math.round(100 * (1 - circ / tot)));
  const poor = [], noVent = [];
  for (const r of d.rooms.filter(x => !['hall', 'stair', 'landing', 'garage', 'store', 'balcony', 'terrace'].includes(x.type))) {
    const ws = d.windows.filter(w => w.roomId === r.id), a = ws.reduce((s, w) => s + w.width * 1.3, 0) / (r.w * r.d); // assumes 1.3 m window height
    if (a < 0.1) poor.push(`${r.name} (${Math.round(a * 100)}%)`);
    const walls = new Set(ws.map(w => w.wall)), opposite = (walls.has('N') && walls.has('S')) || (walls.has('E') && walls.has('W'));
    if (!opposite) noVent.push(r.name);
  }
  push('daylight', 'Natural light', 'A', poor.length ? `Window area is below ~10% of floor area (a common rule of thumb) in: ${poor.join(', ')}. Consider larger or additional windows.` : 'All habitable rooms have window area of about 10% of floor area or more (rule of thumb, window height assumed 1.3 m).');
  push('ventilation', 'Cross-ventilation', 'S', noVent.length ? `No opposite-wall openings in: ${noVent.join(', ')}. Add windows on a second wall or a ventilator to improve airflow.` : 'Every habitable room has windows on opposite walls.');
  const k = d.rooms.find(r => r.type === 'kitchen'), di = d.rooms.find(r => r.type === 'dining');
  if (k && di) push('adjacency', 'Kitchen and dining', 'M', sharedWall(k, di) > 0.8 ? 'Kitchen and dining share a wall, so serving distance is short.' : 'Kitchen and dining are not adjacent; consider moving them together.');
  const top = d.rooms.filter(r => r.floor === d.floors - 1 && !['balcony', 'terrace'].includes(r.type)), roof = top.reduce((s, r) => s + r.w * r.d, 0);
  push('solar', 'Rooftop solar', 'A', `About ${Math.round(roof * 0.4)} m2 of roof could host panels, roughly ${Math.round(roof * 0.4 * 0.2 * 1700 * 0.75).toLocaleString('en-IN')} kWh/year (assumes 40% usable roof, 20% panel efficiency, 1700 kWh/m2/yr sun, 75% system performance). Needs a site survey.`);
  push('materials', 'Materials', 'S', d.materials.floorMaterial === 'marble' ? 'Marble raises cost; large format tiles can give a similar look for less.' : 'Locally sourced finishes usually reduce cost and transport impact.');
  return { insights: out, disclaimer: 'Preliminary heuristics only. Not a daylight/energy simulation, structural check, or building-code approval.' };
}
module.exports = { analyze };
