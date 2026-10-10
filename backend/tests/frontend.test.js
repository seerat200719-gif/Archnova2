// Runs the real js/app.js (Three.js geometry code) in a Node VM with a stubbed DOM and a stubbed WebGL renderer.
// This verifies the layout -> 3D scene path headlessly; it does NOT test visual appearance or real WebGL.
const t = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm'), THREE = require('three');
const { design } = require('./helpers'), { designSchema, validateDesign } = require('../validators/design');
const code = fs.readFileSync(path.join(__dirname, '../../js/app.js'), 'utf8');
function boot() {
  const noop = () => {}, ctx2d = new Proxy({}, { get: (_, k) => k === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop, set: () => true });
  const E = new Proxy({ style: {}, classList: { add: noop, remove: noop, toggle: noop, contains: () => false }, clientWidth: 800, clientHeight: 600, value: '', children: [] }, {
    get: (o, k) => k in o ? o[k] : k === 'parentElement' ? o : k === 'getContext' ? () => ctx2d : k === 'querySelector' ? () => E : k === 'querySelectorAll' ? () => [] : noop, set: (o, k, v) => { o[k] = v; return true } });
  class Renderer { constructor() { this.shadowMap = {}; } setPixelRatio() {} setSize() {} render() {} }
  const g = { Float32Array, Float64Array, Uint32Array, Uint16Array, Uint8Array, Int8Array, Int16Array, ArrayBuffer, DataView, Blob, TextEncoder, URL, btoa, FileReader: class { readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onloadend && this.onloadend(); }); } readAsDataURL(b) { b.arrayBuffer().then(r => { this.result = 'data:' + (b.type || 'application/octet-stream') + ';base64,' + Buffer.from(r).toString('base64'); this.onloadend && this.onloadend(); }); } }, THREE: { ...THREE, WebGLRenderer: Renderer }, console, setTimeout, clearTimeout, Math, JSON, Promise, Date, performance: { now: () => 0 }, requestAnimationFrame: noop, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 800,
    localStorage: { getItem: () => null, setItem: noop }, fetch: () => Promise.reject(new Error('no network')), ResizeObserver: class { observe() {} }, addEventListener: noop, navigator: {}, matchMedia: () => ({ matches: false, addEventListener: noop }),
    document: { querySelector: () => E, querySelectorAll: () => [], getElementById: () => E, createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d, toDataURL: () => '' }), body: E, activeElement: { tagName: '' } } };
  g.window = g; const c = vm.createContext(g); vm.runInContext(code, c); return { run: s => vm.runInContext(s, c), ctx: c };
}
const spec = () => designSchema.parse(design());
t.describe('frontend renderer (headless)', () => {
  const h = boot();
  t.it('boots and builds the template house (regression)', () => { assert.equal(h.run('build();R.length'), h.run('layout(BASE).length')); assert.ok(h.run('G[0].children.length') > 50); });
  t.it('specOk accepts the server-valid fixture and rejects bad designs', () => {
    h.ctx.SPEC = spec(); assert.equal(h.run('specOk(SPEC).length'), 0);
    const bad = spec(); bad.rooms[1].x = 5; h.ctx.BAD = bad; assert.ok(h.run('specOk(BAD)').some(e => /overlaps/.test(e)));
    const f3 = spec(); f3.floors = 3; h.ctx.F3 = f3; assert.ok(h.run('specOk(F3)').some(e => /1 or 2 floors/.test(e)));
    h.ctx.NOPE = { schemaVersion: 2 }; assert.ok(h.run('specOk(NOPE)').length);
  });
  t.it('server-validated designs always satisfy the browser check', () => { const v = validateDesign(design()); h.ctx.V = v.design; assert.ok(v.ok); assert.equal(h.run('specOk(V).length'), 0); });
  t.it('applySpecTo maps materials, floors and lighting into app state', () => {
    h.run('D=applySpecTo({...BASE},SPEC)');
    assert.equal(h.run('D.floors'), 2); assert.equal(h.run('D.mat'), 'wood'); assert.equal(h.run('D.wall'), '#ece6da'); assert.equal(h.run('D.tod'), 'day'); assert.equal(h.run('D.beds'), 3); assert.equal(h.run('D.balcony'), 1);
  });
  t.it('layout() and doors() convert the spec (rooms, furniture, open spaces, door orientation)', () => {
    assert.equal(h.run('layout(D).length'), 10); assert.equal(h.run("layout(D).find(r=>r.id=='balcony').open"), 1); assert.deepEqual(JSON.parse(h.run("JSON.stringify(layout(D).find(r=>r.id=='living').fu)")), [['sofa', 0.5, 0.7, 180]]);
    assert.equal(h.run('doors(D).length'), 9); assert.equal(h.run('doors(D).find(d=>d[0]==0&&d[1]==1.5&&d[2]==5)[4]'), true); assert.equal(h.run('doors(D).find(d=>d[0]==0&&d[1]==6)[4]'), false);
  });
  t.it('stair opening: landing floor excludes the stair footprint', () => {
    const g = JSON.parse(h.run('JSON.stringify(stairGeo())')); assert.ok(g && g.run > 1.2);
    const area = h.run("SR(layout(D).find(r=>r.id=='landing')).reduce((s,q)=>s+q[2]*q[3],0)"); assert.ok(Math.abs(area - (9 - g.w * g.d)) < 0.01, `area ${area}`);
  });
  t.it('builds AI layouts in 3D: rooms, doors, spec windows, stairs, for each roof type', () => {
    for (const roof of ['flat', 'gable', 'mono']) {
      const s = spec(); s.roof.type = roof; h.ctx.S2 = s; h.run('D=applySpecTo({...BASE},S2);build()');
      assert.equal(h.run('R.length'), 10, roof); assert.equal(h.run('DR.length'), 9); assert.equal(h.run('WN[0].length'), 2); assert.equal(h.run('WN[1].length'), 2);
      assert.ok(h.run('G[0].children.length') > 100, roof); assert.ok(h.run('G[1].children.length') > 50); assert.ok(h.run('ROOF.children.length') >= 3);
    }
  });
  t.it('different plots and room counts produce different geometry', () => {
    const big = spec(); big.plot = { width: 14, length: 11 }; h.ctx.BIG = big; h.run('D=applySpecTo({...BASE},BIG);build()'); assert.equal(h.run('PW()'), 14); assert.equal(h.run('PL()'), 11);
    const one = spec(); one.floors = 1; one.rooms = one.rooms.filter(r => r.floor === 0); one.doors = one.doors.filter(d => d.floor === 0); delete one.stairs; h.ctx.ONE = one;
    h.run('D=applySpecTo({...BASE},ONE);build()'); assert.equal(h.run('R.length'), 5); assert.equal(h.run('G[1].children.length'), 0);
  });
  t.it('rejects furniture the renderer does not know and keeps custom state out of template mode', () => {
    const s = spec(); s.rooms[0].furniture[0].type = 'rocket'; h.ctx.RK = s; assert.ok(h.run('specOk(RK)').some(e => /unknown furniture/.test(e)));
    h.run('D={...BASE};build()'); assert.equal(h.run('R.length'), h.run('layout(BASE).length')); assert.equal(h.run('PW()'), 12);
  });
  t.it('state sent to the API (stateOut) passes the server schema, for template and AI designs', () => {
    const { state } = require('../validators/api');
    h.run("D={...BASE,tod:'golden',solar:true,refs:[{title:'x',source:'y',link:'https://e.co',thumb:''}],fx:{living:[['plant',0.1,0.9,0]]}};build()");
    assert.ok(state.safeParse(h.run('stateOut()')).success, 'template state');
    h.run('D=applySpecTo({...BASE},SPEC);build()'); const o = h.run('stateOut()'); assert.ok(state.safeParse(o).success, JSON.stringify(state.safeParse(o).error?.issues)); assert.equal(h.run('stateOut().custom'), undefined);
  });
  t.it('client export payloads pass the server schemas (template and AI designs)', () => {
    const P = require('../validators/export'), { parseImport } = require('../routes/export'), X = require('../services/exporter');
    for (const setup of ['D={...BASE};build()', 'D=applySpecTo({...BASE},SPEC);build()']) {
      h.run(setup); const plan = JSON.parse(h.run('JSON.stringify(planOut())')), r = P.planReq.safeParse({ plan }); assert.ok(r.success, JSON.stringify(r.error?.issues?.slice(0, 3)));
      const svg = X.planSvg(r.data.plan, 0); assert.equal((svg.match(/data-room=/g) || []).length, plan.rooms.filter(x => x.floor === 0).length); assert.ok(r.data.plan.windows.length > 0 && r.data.plan.doors.length > 0 && r.data.plan.stairs);
      const env = JSON.parse(h.run('JSON.stringify(envOut())')), imp = parseImport(env); assert.equal(imp.kind, 'project'); assert.equal(imp.projects[0].design ? imp.projects[0].design.rooms.length : 0, setup.includes('SPEC') ? 10 : 0);
    }
  });
  t.it('exports a valid GLB (Khronos glTF validator) of the real scene', async () => {
    h.run('D=applySpecTo({...BASE},SPEC);build();mats.floor.map=null;mats.grass.map=null;mats.floor.needsUpdate=true');
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../node_modules/three/examples/js/exporters/GLTFExporter.js'), 'utf8'), h.ctx);
    const glb = await new Promise((res, rej) => { h.ctx.__ok = res; h.ctx.__bad = rej; vm.runInContext('try{new THREE.GLTFExporter().parse(root,r=>__ok(r),{binary:true,onlyVisible:true})}catch(e){__bad(e)}', h.ctx); });
    const b = Buffer.from(glb); assert.equal(b.toString('latin1', 0, 4), 'glTF'); assert.equal(b.readUInt32LE(4), 2); assert.equal(b.readUInt32LE(8), b.length);
    const json = JSON.parse(b.toString('utf8', 20, 20 + b.readUInt32LE(12))); assert.ok(json.meshes.length > 100 && json.materials.length >= 5 && json.nodes.length > 100, `${json.meshes.length} meshes`);
    const rep = await require('gltf-validator').validateBytes(new Uint8Array(b)); assert.equal(rep.issues.numErrors, 0, JSON.stringify(rep.issues.messages.filter(m => m.severity === 0).slice(0, 3)));
  });
});
