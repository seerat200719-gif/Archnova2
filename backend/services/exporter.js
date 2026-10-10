// Vector floor-plan (SVG + PDF) and summary PDF generation from a validated plan. No screenshots: real geometry and text.
const PDFDocument = require('pdfkit'), { estimate } = require('./estimator');
const FT = 3.28084, esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const size = r => `${r.w.toFixed(1)} x ${r.d.toFixed(1)} m (${Math.round(r.w * FT)} x ${Math.round(r.d * FT)} ft)`, FLN = f => (f ? 'First floor' : 'Ground floor');
const OPEN = ['balcony', 'terrace'];
const planEstimate = p => estimate({ rooms: p.rooms.map(r => ({ ...r, type: r.type === 'room' && /balcony|terrace/i.test(r.name) ? 'balcony' : r.id === 'landing' ? 'landing' : r.type })), budget: { tier: p.budgetTier }, materials: p.materials, style: p.style }, {});
function planSvg(p, floor) {
  const S = 50, M = 44, W = p.plot.width * S, L = p.plot.length * S, vw = W + 2 * M + 30, vh = L + 2 * M + 50, f = floor;
  let o = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}" font-family="Helvetica,Arial,sans-serif"><rect width="100%" height="100%" fill="#fff"/><text x="${M}" y="26" font-size="16" fill="#111">${esc(p.name)} - ${FLN(f)}</text><g transform="translate(${M},${M})">`;
  for (let i = 0; i <= p.plot.width; i++) o += `<line x1="${i * S}" x2="${i * S}" y1="0" y2="${L}" stroke="#0000000f"/>`;
  for (let i = 0; i <= p.plot.length; i++) o += `<line y1="${i * S}" y2="${i * S}" x1="0" x2="${W}" stroke="#0000000f"/>`;
  o += `<rect width="${W}" height="${L}" fill="none" stroke="#999" stroke-dasharray="6 4"/>`;
  for (const r of p.rooms.filter(r => r.floor === f)) {
    const x = r.x * S, y = r.z * S, w = r.w * S, h = r.d * S;
    o += `<g data-room="${esc(r.id)}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#f5f3ee" stroke="#111" stroke-width="3"/>`;
    for (const q of r.furniture) { const rot = q.rot % 180 === 90, a = 40, b = 28; o += `<rect x="${x + q.fx * w - (rot ? b : a) / 2}" y="${y + q.fz * h - (rot ? a : b) / 2}" width="${rot ? b : a}" height="${rot ? a : b}" rx="3" fill="none" stroke="#777"><title>${esc(q.type)}</title></rect>`; }
    o += `<text x="${x + w / 2}" y="${y + 18}" font-size="12" text-anchor="middle" fill="#111">${esc(r.name)}</text><text x="${x + w / 2}" y="${y + 32}" font-size="10" text-anchor="middle" fill="#555">${esc(size(r))}</text></g>`;
  }
  if (p.stairs) { const s = p.stairs, x = s.x * S, y = s.z * S, w = s.w * S, h = s.d * S; o += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f ? 'none' : '#e8e4da'}" stroke="#111" ${f ? 'stroke-dasharray="5 3"' : ''}/>`; const n = 8; for (let i = 1; i < n && !f; i++) o += h >= w ? `<line x1="${x}" x2="${x + w}" y1="${y + h * i / n}" y2="${y + h * i / n}" stroke="#777"/>` : `<line y1="${y}" y2="${y + h}" x1="${x + w * i / n}" x2="${x + w * i / n}" stroke="#777"/>`; o += `<text x="${x + w / 2}" y="${y + h / 2}" font-size="9" text-anchor="middle" fill="#555">${f ? 'stair opening' : 'UP'}</text>`; }
  for (const d of p.doors.filter(d => d.floor === f)) {
    const w = d.width * S, x = d.x * S, y = d.z * S;
    o += d.hz ? `<line x1="${x - w / 2}" x2="${x + w / 2}" y1="${y}" y2="${y}" stroke="#fff" stroke-width="6"/>${d.width > 1.5 ? '' : `<path d="M${x - w / 2} ${y}V${y - w}M${x + w / 2} ${y}A${w} ${w} 0 0 0 ${x - w / 2} ${y - w}" fill="none" stroke="#555"/>`}`
      : `<line y1="${y - w / 2}" y2="${y + w / 2}" x1="${x}" x2="${x}" stroke="#fff" stroke-width="6"/>${d.width > 1.5 ? '' : `<path d="M${x} ${y - w / 2}H${x - w}M${x} ${y + w / 2}A${w} ${w} 0 0 1 ${x - w} ${y - w / 2}" fill="none" stroke="#555"/>`}`;
  }
  for (const w of p.windows.filter(w => w.floor === f)) { const a = (w.t - w.width / 2) * S, b = (w.t + w.width / 2) * S, c = w.c * S; o += w.hor ? `<line x1="${a}" x2="${b}" y1="${c}" y2="${c}" stroke="#3b82c4" stroke-width="6"/>` : `<line y1="${a}" y2="${b}" x1="${c}" x2="${c}" stroke="#3b82c4" stroke-width="6"/>`; }
  o += `<line x1="0" x2="${5 * S}" y1="${L + 24}" y2="${L + 24}" stroke="#111" stroke-width="3"/><text x="0" y="${L + 40}" font-size="10" fill="#111">5 m</text><text x="${W / 2}" y="-12" font-size="10" text-anchor="middle" fill="#555">${p.plot.width.toFixed(1)} m</text><text x="${W + 10}" y="${L / 2}" font-size="10" fill="#555">${p.plot.length.toFixed(1)} m</text><text x="${W - 4}" y="-12" font-size="11" text-anchor="end" fill="#111">N (rear)</text>`;
  return o + '</g></svg>';
}
function drawPlan(doc, p, f, x0, y0, bw, bh) {
  const s = Math.min(bw / p.plot.width, bh / p.plot.length), X = v => x0 + v * s, Y = v => y0 + v * s;
  doc.lineWidth(0.5).strokeColor('#999').dash(3, { space: 2 }).rect(X(0), Y(0), p.plot.width * s, p.plot.length * s).stroke().undash();
  for (const r of p.rooms.filter(r => r.floor === f)) {
    doc.lineWidth(1.4).strokeColor('#111').fillColor('#f5f3ee').rect(X(r.x), Y(r.z), r.w * s, r.d * s).fillAndStroke();
    doc.lineWidth(0.4).strokeColor('#777'); for (const q of r.furniture) { const rot = q.rot % 180 === 90, a = 0.8 * s, b = 0.55 * s; doc.rect(X(r.x) + q.fx * r.w * s - (rot ? b : a) / 2, Y(r.z) + q.fz * r.d * s - (rot ? a : b) / 2, rot ? b : a, rot ? a : b).stroke(); }
    doc.fillColor('#111').fontSize(Math.min(9, Math.max(5, r.w * s / 8))).text(r.name, X(r.x) + 2, Y(r.z) + 3, { width: r.w * s - 4, align: 'center', lineBreak: false }).fontSize(6).fillColor('#555').text(size(r), X(r.x) + 2, Y(r.z) + 13, { width: r.w * s - 4, align: 'center', lineBreak: false });
  }
  if (p.stairs) { const t = p.stairs; doc.lineWidth(0.8).strokeColor('#111'); if (f) doc.dash(2, { space: 2 }); doc.rect(X(t.x), Y(t.z), t.w * s, t.d * s).stroke().undash(); doc.fontSize(6).fillColor('#555').text(f ? 'stair opening' : 'UP', X(t.x), Y(t.z) + t.d * s / 2 - 3, { width: t.w * s, align: 'center', lineBreak: false }); }
  for (const d of p.doors.filter(d => d.floor === f)) { const w = d.width * s; doc.lineWidth(3).strokeColor('#fff'); d.hz ? doc.moveTo(X(d.x) - w / 2, Y(d.z)).lineTo(X(d.x) + w / 2, Y(d.z)).stroke() : doc.moveTo(X(d.x), Y(d.z) - w / 2).lineTo(X(d.x), Y(d.z) + w / 2).stroke(); }
  doc.lineWidth(3).strokeColor('#3b82c4'); for (const w of p.windows.filter(w => w.floor === f)) { const a = (w.t - w.width / 2) * s, b = (w.t + w.width / 2) * s; w.hor ? doc.moveTo(X(0) + a, Y(w.c / 1)).lineTo(X(0) + b, Y(w.c)).stroke() : doc.moveTo(X(w.c), Y(0) + a).lineTo(X(w.c), Y(0) + b).stroke(); }
  doc.lineWidth(1).strokeColor('#111').moveTo(x0, y0 + p.plot.length * s + 12).lineTo(x0 + 5 * s, y0 + p.plot.length * s + 12).stroke().fontSize(7).fillColor('#111').text('5 m', x0, y0 + p.plot.length * s + 15, { lineBreak: false });
}
function schedule(doc, p, y) {
  const cols = [['Room', 120], ['Floor', 70], ['Size', 190], ['Area m2', 55], ['Area sq ft', 60], ['Furniture', 200]]; let x = 40;
  doc.fontSize(8).fillColor('#111'); cols.forEach(([h, w]) => { doc.text(h, x, y, { width: w, lineBreak: false }); x += w; }); doc.moveTo(40, y + 11).lineTo(800, y + 11).lineWidth(0.5).strokeColor('#999').stroke(); y += 15;
  for (const r of p.rooms.slice().sort((a, b) => a.floor - b.floor)) {
    if (y > 540) { doc.addPage(); y = 40; }
    const row = [r.name, FLN(r.floor), size(r), (r.w * r.d).toFixed(1), Math.round(r.w * r.d * FT * FT), [...new Set(r.furniture.map(q => q.type))].join(', ') || '-']; x = 40;
    row.forEach((c, i) => { doc.text(String(c), x, y, { width: cols[i][1] - 4, lineBreak: false }); x += cols[i][1]; }); y += 13;
  }
  return y;
}
const build = (fn, opts = {}) => new Promise((res, rej) => { const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40, compress: false, info: { Title: opts.title || 'ArchNova', Creator: 'ArchNova' } }), c = []; doc.on('data', b => c.push(b)); doc.on('end', () => res(Buffer.concat(c))); doc.on('error', rej); fn(doc); doc.end(); });
const planPages = (doc, p) => { for (let f = 0; f < p.floors; f++) { if (f || doc.page.__used) doc.addPage(); doc.page.__used = true; doc.fontSize(14).fillColor('#111').text(`${p.name} - ${FLN(f)}`, 40, 30, { lineBreak: false }); drawPlan(doc, p, f, 60, 60, 700, 430); doc.fontSize(7).fillColor('#555').text('Concept layout, not a structurally verified or code-compliant plan. Blue = windows, gaps = doors.', 40, 560, { lineBreak: false }); } doc.addPage(); doc.fontSize(14).fillColor('#111').text('Room schedule', 40, 30); schedule(doc, p, 60); };
const floorPlanPdf = p => build(d => planPages(d, p), { title: p.name + ' floor plan' });
const money = v => 'INR ' + Math.round(v).toLocaleString('en-IN');
function summaryPdf(p) {
  const e = planEstimate(p);
  return build(d => {
    d.page.__used = true; d.fontSize(22).fillColor('#111').text(p.name, 40, 40); d.fontSize(10).fillColor('#555').text('ArchNova design summary - ' + new Date().toISOString().slice(0, 10), 40, 70);
    const area = p.rooms.reduce((s, r) => s + r.w * r.d, 0), facts = [['Style', p.style || '-'], ['Plot', `${p.plot.width.toFixed(1)} x ${p.plot.length.toFixed(1)} m (${Math.round(p.plot.width * FT)} x ${Math.round(p.plot.length * FT)} ft)`], ['Floors', p.floors], ['Rooms', p.rooms.length], ['Total room area', `${area.toFixed(1)} m2 (${Math.round(area * FT * FT)} sq ft)`], ['Floor material', p.materials.floorMaterial]];
    let y = 100; facts.forEach(([k, v]) => { d.fontSize(10).fillColor('#555').text(k, 40, y, { width: 130, lineBreak: false }).fillColor('#111').text(String(v), 170, y, { lineBreak: false }); y += 16; });
    y += 6; d.fontSize(10).fillColor('#555').text('Colours', 40, y, { lineBreak: false }); [['wall', p.materials.wall], ['floor', p.materials.floor], ['furniture', p.materials.furniture], ['exterior', p.materials.exterior]].forEach(([k, c], i) => { d.rect(170 + i * 90, y - 2, 14, 14).fillColor(c).fill(); d.fillColor('#111').fontSize(8).text(k + ' ' + c, 188 + i * 90, y, { lineBreak: false }); }); y += 28;
    d.fontSize(13).fillColor('#111').text('Estimated cost (planning estimate)', 40, y); y += 20; d.fontSize(11).text(`${money(e.low)} to ${money(e.high)}  (${e.builtUpSqFt} sq ft built-up, about INR ${e.ratePerSqFt}/sq ft)`, 40, y); y += 20;
    e.breakdown.forEach(b => { d.fontSize(9).fillColor('#111').text(`${b.name} (${b.percent}%)`, 40, y, { width: 200, lineBreak: false }).text(`${money(b.low)} to ${money(b.high)}`, 250, y, { lineBreak: false }); y += 12; });
    y += 6; e.assumptions.forEach(a => { d.fontSize(8).fillColor('#555').text('- ' + a, 40, y, { width: 740 }); y = d.y + 2; }); d.fontSize(8).fillColor('#b3412a').text('Limitations: ' + e.limitations, 40, y + 4, { width: 740 });
    d.addPage(); planPages(d, p);
  }, { title: p.name + ' summary' });
}
module.exports = { planSvg, floorPlanPdf, summaryPdf, planEstimate };
