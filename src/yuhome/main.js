// Yuhome growth spike: how far can a stylized, instanced Three.js scene scale on real devices?
// Everything repeated (buildings, trees, roads, Yusians) is an InstancedMesh, so the draw-call
// count stays flat while the object count grows from 1 cottage to ~20,000 buildings.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---------- Settings ----------
const STAGES = [
  { id: 'cottage', label: 'Cottage', plots: 1 },
  { id: 'hamlet', label: 'Hamlet', plots: 40 },
  { id: 'village', label: 'Village', plots: 300 },
  { id: 'town', label: 'Town', plots: 2500 },
  { id: 'city', label: 'City', plots: 10000 },
  { id: 'metropolis', label: 'Metropolis', plots: 20000 },
];
const YUSIAN_COUNTS = [10, 50, 200, 500, 1000, 2000];
const QUALITY = {
  low: { label: 'Low', pixelRatio: 1, shadows: false, outlines: false, shadowMap: 0 },
  medium: { label: 'Medium', pixelRatio: 1.5, shadows: true, outlines: false, shadowMap: 1024 },
  high: { label: 'High', pixelRatio: 2, shadows: true, outlines: true, shadowMap: 2048 },
};
const VIEWS = { overview: 'Orbit', street: 'Follow a Yusian' };

const PLOT = 3; // plot width
const ROAD = 2; // road width
const BLOCK = 4; // plots per block side
const SPAN = BLOCK * PLOT + ROAD; // 14: distance between road centre lines
const GRID_HALF = 72; // plots from centre to edge, (2*72)^2 = 20,736 plots
const MAX_YUSIANS = 2000;

const state = {
  stage: 'village',
  yusians: 200,
  quality: 'medium',
  view: 'overview',
  benchmarking: false,
};

// ---------- Helpers ----------
const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const pick = (arr, t) => arr[Math.floor(t * arr.length) % arr.length];
const plotCoord = (i) => {
  const b = Math.floor(i / BLOCK);
  const w = i - b * BLOCK;
  return b * SPAN + ROAD / 2 + PLOT / 2 + w * PLOT;
};

// ---------- Renderer, scene, camera ----------
const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.info.autoReset = false;

const SKY = new THREE.Color('#bcdde6');
const scene = new THREE.Scene();
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 100, 400);

const camera = new THREE.PerspectiveCamera(45, 1, 0.3, 5000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.46;
controls.minDistance = 4;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.6;

scene.add(new THREE.HemisphereLight('#e8f4ff', '#6f8f55', 1.6));
const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// Three-step toon ramp: the stylized, non-realistic look the pitch asks for.
const ramp = new THREE.DataTexture(new Uint8Array([90, 170, 255]), 3, 1, THREE.RedFormat);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
ramp.needsUpdate = true;
const toon = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: ramp });

// Inverted-hull outline: draws back faces pushed out along the normal, shares the instance matrices.
const outlineMat = new THREE.MeshBasicMaterial({ color: '#2b2440', side: THREE.BackSide });
outlineMat.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    '#include <begin_vertex>',
    'vec3 transformed = position + normalize(normal) * 0.035;'
  );
};

// ---------- Geometry ----------
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
const GEO = {
  cottageBody: box(1, 1, 1),
  cottageRoof: new THREE.ConeGeometry(0.78, 1, 4).rotateY(Math.PI / 4).translate(0, 0.5, 0),
  shopBody: box(1, 1, 1),
  shopRoof: box(1, 1, 1),
  towerBody: new THREE.CylinderGeometry(0.5, 0.56, 1, 8).translate(0, 0.5, 0),
  towerRoof: new THREE.ConeGeometry(0.62, 1, 8).translate(0, 0.5, 0),
  trunk: new THREE.CylinderGeometry(0.12, 0.16, 1, 5).translate(0, 0.5, 0),
  canopy: new THREE.IcosahedronGeometry(0.8, 0),
  road: box(1, 1, 1),
  hill: new THREE.DodecahedronGeometry(1, 0),
  yBody: new THREE.CapsuleGeometry(0.26, 0.42, 3, 8).translate(0, 0.55, 0),
  yHead: new THREE.SphereGeometry(0.24, 12, 8).translate(0, 1.2, 0),
};

const MAX_PLOTS = (GRID_HALF * 2) ** 2;
const meshes = {};
const outlines = [];
function makeMesh(name, geo, capacity, { shadow = true, outline = false } = {}) {
  const m = new THREE.InstancedMesh(geo, toon, capacity);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color()); // allocate the colour buffer up front
  m.count = 0;
  m.castShadow = shadow;
  m.receiveShadow = true;
  m.frustumCulled = false;
  scene.add(m);
  meshes[name] = m;
  if (outline) {
    const o = new THREE.InstancedMesh(geo, outlineMat, capacity);
    o.instanceMatrix = m.instanceMatrix; // same matrices, no extra upload
    o.count = 0;
    o.frustumCulled = false;
    o.userData.source = m;
    scene.add(o);
    outlines.push(o);
  }
  return m;
}
makeMesh('cottageBody', GEO.cottageBody, MAX_PLOTS, { outline: true });
makeMesh('cottageRoof', GEO.cottageRoof, MAX_PLOTS, { outline: true });
makeMesh('shopBody', GEO.shopBody, MAX_PLOTS, { outline: true });
makeMesh('shopRoof', GEO.shopRoof, MAX_PLOTS, { outline: true });
makeMesh('towerBody', GEO.towerBody, MAX_PLOTS, { outline: true });
makeMesh('towerRoof', GEO.towerRoof, MAX_PLOTS, { outline: true });
makeMesh('trunk', GEO.trunk, 40000);
makeMesh('canopy', GEO.canopy, 40000, { outline: true });
makeMesh('road', GEO.road, 200, { shadow: false });
makeMesh('hill', GEO.hill, 400, { shadow: false });
makeMesh('yBody', GEO.yBody, MAX_YUSIANS, { outline: true });
makeMesh('yHead', GEO.yHead, MAX_YUSIANS, { outline: true });

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2),
  new THREE.MeshToonMaterial({ color: '#93c46f', gradientMap: ramp })
);
ground.receiveShadow = true;
scene.add(ground);

// ---------- Palettes ----------
const C = (hex) => new THREE.Color(hex);
const PAL = {
  wall: ['#f7ecd9', '#f3e2c4', '#ead7c0', '#fbf3e6', '#e9dccb'].map(C),
  roof: ['#d9694f', '#4f7fb8', '#3f9c94', '#7b8f3a', '#b2507a', '#e39a3b'].map(C),
  shop: ['#f2b8a0', '#a9d3c9', '#f5d58a', '#c3b5e3', '#f0c4d8'].map(C),
  shopRoof: ['#5b4a6b', '#3d5a6c', '#6b4a3d'].map(C),
  tower: ['#cfc6e0', '#d8d0c4', '#bcc9d9'].map(C),
  towerRoof: ['#3b5fa8', '#e0a93a', '#3f8f7a', '#8c4fb0'].map(C),
  leaf: ['#4f9a4a', '#5fae52', '#3f8a52', '#79b84a', '#e38f4a'].map(C),
  trunk: C('#7a5639'),
  road: C('#e6d2a6'),
  hill: ['#6fa85a', '#7fb565', '#5e9a58'].map(C),
  yusian: ['#ff6b8b', '#ffb84a', '#5ad0ff', '#9b7bff', '#47e0a1', '#ff8f4a', '#f2f05a'].map(C),
  skin: ['#ffe0c7', '#f1c39a', '#c98e62', '#8d5a3b', '#d9f0ff', '#e6d6ff'].map(C),
};

// ---------- Plots, sorted so the Yuhome grows outward from the first cottage ----------
const plots = [];
for (let i = -GRID_HALF; i < GRID_HALF; i++) {
  for (let j = -GRID_HALF; j < GRID_HALF; j++) {
    const x = plotCoord(i);
    const z = plotCoord(j);
    const d = Math.hypot(x, z) * (0.85 + hash(i, j) * 0.3); // a little organic unevenness
    plots.push({ i, j, x, z, d });
  }
}
plots.sort((a, b) => a.d - b.d);

// ---------- Build the Yuhome for a stage ----------
const m4 = new THREE.Matrix4();
const q = new THREE.Quaternion();
const v = new THREE.Vector3();
const s = new THREE.Vector3();
const yAxis = new THREE.Vector3(0, 1, 0);
const counts = {};
function put(name, x, y, z, sx, sy, sz, rotY, color) {
  const mesh = meshes[name];
  const k = counts[name]++;
  q.setFromAxisAngle(yAxis, rotY);
  m4.compose(v.set(x, y, z), q, s.set(sx, sy, sz));
  mesh.setMatrixAt(k, m4);
  mesh.setColorAt(k, color);
}

let bounds = { lo: 0, hi: SPAN, radius: 20 };
let stats = { buildings: 0, trees: 0 };

function buildStage(stageId) {
  const stage = STAGES.find((st) => st.id === stageId);
  const n = stage.plots;
  for (const name in meshes) counts[name] = 0;
  let buildings = 0;
  let minC = Infinity;
  let maxC = -Infinity;

  for (let k = 0; k < n; k++) {
    const p = plots[k];
    const h1 = hash(p.i, p.j);
    const h2 = hash(p.j + 7, p.i - 3);
    const h3 = hash(p.i * 3 + 1, p.j * 5 + 2);
    const r = k / n;
    minC = Math.min(minC, p.x, p.z);
    maxC = Math.max(maxC, p.x, p.z);
    const rot = Math.floor(h2 * 4) * (Math.PI / 2);

    if (k > 0 && h1 < 0.1) {
      // Park plot: a few trees.
      const t = 1 + Math.floor(h2 * 3);
      for (let u = 0; u < t; u++) addTree(p.x + (hash(k, u) - 0.5) * 2, p.z + (hash(u, k) - 0.5) * 2, hash(k + u, 9));
      continue;
    }
    buildings++;
    if (n >= 2500 && r < 0.06) {
      const h = 4 + (1 - r / 0.06) * Math.min(14, 4 + n / 1500) + h3 * 3;
      put('towerBody', p.x, 0, p.z, 2, h, 2, rot, pick(PAL.tower, h1));
      put('towerRoof', p.x, h, p.z, 2.2, 2 + h3 * 1.5, 2.2, rot, pick(PAL.towerRoof, h3));
    } else if (n >= 300 && r < 0.3) {
      const h = 1.6 + h3 * 1.4;
      put('shopBody', p.x, 0, p.z, 2.3, h, 2.3, rot, pick(PAL.shop, h1));
      put('shopRoof', p.x, h, p.z, 2.6, 0.28, 2.6, rot, pick(PAL.shopRoof, h3));
    } else {
      const h = 1.0 + h3 * 0.5;
      const w = 1.5 + h1 * 0.4;
      put('cottageBody', p.x, 0, p.z, w, h, w * 0.9, rot, pick(PAL.wall, h1));
      put('cottageRoof', p.x, h, p.z, w * 1.05, 0.9 + h2 * 0.5, w * 0.95, rot, pick(PAL.roof, h2));
      if (h3 > 0.55) addTree(p.x + 1.2, p.z - 1.2, h3);
    }
  }

  // Roads: one stretched box per road line, covering the occupied blocks.
  const bLo = Math.floor(minC / SPAN);
  const bHi = Math.ceil(maxC / SPAN);
  const lo = bLo * SPAN;
  const hi = bHi * SPAN;
  for (let b = bLo; b <= bHi; b++) {
    const c = b * SPAN;
    put('road', c, 0, (lo + hi) / 2, ROAD, 0.04, hi - lo + ROAD, 0, PAL.road);
    put('road', (lo + hi) / 2, 0, c, hi - lo + ROAD, 0.04, ROAD, 0, PAL.road);
  }
  bounds = { lo, hi, radius: Math.max(hi - lo, SPAN) * 0.72 };

  // Forest ring and hills beyond the edge: the world past the Yuhome.
  const cx = (lo + hi) / 2;
  const inner = bounds.radius + 6;
  const forest = Math.min(12000, 120 + Math.floor(inner * 22));
  for (let k = 0; k < forest; k++) {
    const a = hash(k, 1.3) * Math.PI * 2;
    const rr = inner + Math.pow(hash(2.7, k), 0.7) * (30 + inner * 0.5);
    addTree(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr, hash(k, 4.4));
  }
  const hills = 120;
  for (let k = 0; k < hills; k++) {
    const a = (k / hills) * Math.PI * 2 + hash(k, 8) * 0.05;
    const rr = inner + 40 + inner * 0.6 + hash(k, 3) * 40;
    const sz = 14 + hash(3, k) * 26 + inner * 0.12;
    put('hill', cx + Math.cos(a) * rr, -sz * 0.35, cx + Math.sin(a) * rr, sz * 1.4, sz, sz * 1.2, hash(k, 5) * 6, pick(PAL.hill, hash(k, 6)));
  }

  for (const name in meshes) {
    if (name === 'yBody' || name === 'yHead') continue;
    const mesh = meshes[name];
    mesh.count = counts[name];
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  ground.scale.setScalar(bounds.radius * 6 + 400);
  ground.position.set(cx, 0, cx);
  scene.fog.near = bounds.radius * 1.2;
  scene.fog.far = bounds.radius * 5 + 120;

  stats = { buildings, trees: counts.trunk };
  placeSun();
  resetYusians();
  frameCamera();
  document.getElementById('stage-label').textContent = stage.label;
}

function addTree(x, z, t) {
  const h = 0.9 + t * 0.9;
  const sc = 0.8 + t * 0.7;
  put('trunk', x, 0, z, 1, h, 1, 0, PAL.trunk);
  put('canopy', x, h + 0.5 * sc, z, sc, sc * 1.15, sc, t * 6, pick(PAL.leaf, t));
}

function placeSun() {
  const cx = (bounds.lo + bounds.hi) / 2;
  const r = bounds.radius;
  sun.position.set(cx + r * 0.6 + 20, r * 1.1 + 40, cx + r * 0.35 + 10);
  sun.target.position.set(cx, 0, cx);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -(r + 12);
  cam.right = cam.top = r + 12;
  cam.near = 1;
  cam.far = r * 4 + 120;
  cam.updateProjectionMatrix();
}

function frameCamera() {
  const cx = (bounds.lo + bounds.hi) / 2;
  const d = bounds.radius * 1.9 + 14;
  controls.target.set(cx, 0, cx);
  camera.position.set(cx + d * 0.7, d * 0.62, cx + d * 0.7);
  controls.maxDistance = d * 3;
  camera.far = d * 8 + 800;
  camera.updateProjectionMatrix();
  controls.update();
}

// ---------- Yusians: walk the roads, turn at crossings ----------
const yusians = [];
function resetYusians() {
  yusians.length = 0;
  const lines = Math.round((bounds.hi - bounds.lo) / SPAN) + 1;
  for (let k = 0; k < MAX_YUSIANS; k++) {
    const axis = hash(k, 0.5) < 0.5 ? 0 : 1;
    const line = bounds.lo + Math.floor(hash(k, 1.5) * lines) * SPAN;
    yusians.push({
      axis,
      line,
      t: bounds.lo + hash(k, 2.5) * (bounds.hi - bounds.lo),
      dir: hash(k, 3.5) < 0.5 ? -1 : 1,
      speed: 1.1 + hash(k, 4.5) * 0.9,
      lane: (hash(k, 5.5) - 0.5) * 1.2,
      phase: hash(k, 6.5) * 10,
      body: pick(PAL.yusian, hash(k, 7.5)),
      skin: pick(PAL.skin, hash(k, 8.5)),
    });
  }
  const yb = meshes.yBody;
  const yh = meshes.yHead;
  for (let k = 0; k < MAX_YUSIANS; k++) {
    yb.setColorAt(k, yusians[k].body);
    yh.setColorAt(k, yusians[k].skin);
  }
  yb.instanceColor.needsUpdate = yh.instanceColor.needsUpdate = true;
}

const followPos = new THREE.Vector3();
const followDir = new THREE.Vector3(1, 0, 0);
function updateYusians(dt, time) {
  const n = state.yusians;
  const yb = meshes.yBody;
  const yh = meshes.yHead;
  const { lo, hi } = bounds;
  for (let k = 0; k < n; k++) {
    const y = yusians[k];
    const before = y.t;
    y.t += y.dir * y.speed * dt;
    if (y.t < lo) { y.t = lo; y.dir = 1; }
    if (y.t > hi) { y.t = hi; y.dir = -1; }
    // Crossed an intersection? Sometimes turn onto the cross street.
    const cellA = Math.floor((before - lo) / SPAN);
    const cellB = Math.floor((y.t - lo) / SPAN);
    if (cellA !== cellB && Math.random() < 0.4) {
      const cross = lo + Math.max(cellA, cellB) * SPAN;
      const oldLine = y.line;
      y.line = cross;
      y.t = oldLine;
      y.axis = 1 - y.axis;
      y.dir = Math.random() < 0.5 ? -1 : 1;
    }
    const along = y.t;
    const off = y.line + y.lane;
    const x = y.axis === 0 ? along : off;
    const z = y.axis === 0 ? off : along;
    const bob = Math.abs(Math.sin(time * 9 * y.speed + y.phase)) * 0.12;
    const rot = y.axis === 0 ? (y.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (y.dir > 0 ? 0 : Math.PI);
    q.setFromAxisAngle(yAxis, rot);
    m4.compose(v.set(x, bob, z), q, s.set(1.25, 1.25, 1.25));
    yb.setMatrixAt(k, m4);
    yh.setMatrixAt(k, m4);
    if (k === 0) {
      followPos.set(x, 0, z);
      followDir.set(y.axis === 0 ? y.dir : 0, 0, y.axis === 1 ? y.dir : 0);
    }
  }
  yb.count = yh.count = n;
  yb.instanceMatrix.needsUpdate = yh.instanceMatrix.needsUpdate = true;
}

// ---------- Quality ----------
function applyQuality() {
  const qy = QUALITY[state.quality];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, qy.pixelRatio));
  renderer.shadowMap.enabled = qy.shadows;
  sun.castShadow = qy.shadows;
  if (qy.shadows && sun.shadow.mapSize.x !== qy.shadowMap) {
    sun.shadow.mapSize.set(qy.shadowMap, qy.shadowMap);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
  for (const o of outlines) o.visible = qy.outlines;
  toon.needsUpdate = true;
  resize();
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- HUD ----------
const el = (id) => document.getElementById(id);
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : n.toLocaleString());
let frameTimes = [];
let windowStart = performance.now();
function updateHud(now) {
  if (now - windowStart < 500) return;
  const secs = (now - windowStart) / 1000;
  const fps = frameTimes.length / secs;
  const avg = frameTimes.reduce((a, b) => a + b, 0) / Math.max(1, frameTimes.length);
  const f = el('fps');
  f.textContent = Math.round(fps);
  f.className = fps >= 50 ? '' : fps >= 28 ? 'warn' : 'bad';
  el('ms').textContent = avg.toFixed(1) + ' ms';
  el('draws').textContent = renderer.info.render.calls;
  el('tris').textContent = fmt(renderer.info.render.triangles);
  el('objects').textContent = fmt(stats.buildings + stats.trees + state.yusians);
  frameTimes = [];
  windowStart = now;
}

// ---------- Controls UI ----------
function chips(containerId, options, key, onChange) {
  const box = el(containerId);
  box.replaceChildren();
  for (const [value, label] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.dataset.value = String(value);
    b.setAttribute('aria-pressed', String(state[key] === value));
    b.addEventListener('click', () => {
      if (state.benchmarking) return;
      state[key] = value;
      for (const c of box.children) c.setAttribute('aria-pressed', String(c.dataset.value === String(value)));
      onChange(value);
    });
    box.appendChild(b);
  }
}
chips('stage-chips', STAGES.map((st) => [st.id, st.label]), 'stage', buildStage);
chips('yusian-chips', YUSIAN_COUNTS.map((n) => [n, n.toLocaleString()]), 'yusians', () => {});
chips('quality-chips', Object.entries(QUALITY).map(([k, qy]) => [k, qy.label]), 'quality', applyQuality);
chips('view-chips', Object.entries(VIEWS), 'view', (view) => {
  controls.enabled = view === 'overview';
  if (view === 'overview') frameCamera();
});

el('panel-toggle').addEventListener('click', () => {
  const body = el('panel-body');
  body.hidden = !body.hidden;
  el('panel-toggle').setAttribute('aria-expanded', String(!body.hidden));
});
if (window.innerWidth < 560) el('panel-toggle').click(); // start collapsed on phones

// Device info for the benchmark report.
const gl = renderer.getContext();
const dbg = gl.getExtension('WEBGL_debug_renderer_info');
const gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
const device = `${gpu} · ${screen.width}×${screen.height} @${window.devicePixelRatio}x · ${navigator.userAgent.match(/(iPhone|iPad|Android|Macintosh|Windows|Linux|CrOS)/)?.[0] ?? 'unknown'}`;
el('device').textContent = device;

// ---------- Benchmark ----------
const BENCH_STAGES = ['hamlet', 'village', 'town', 'city', 'metropolis'];
const bench = { active: false, idx: 0, phaseStart: 0, warm: true, samples: [], results: [] };

function setStageChip(id) {
  for (const c of el('stage-chips').children) c.setAttribute('aria-pressed', String(c.dataset.value === id));
}
el('bench-btn').addEventListener('click', () => {
  if (state.benchmarking) return;
  state.benchmarking = true;
  state.view = 'overview';
  controls.enabled = true;
  for (const c of el('view-chips').children) c.setAttribute('aria-pressed', String(c.dataset.value === 'overview'));
  document.querySelectorAll('.chips button, #bench-btn').forEach((b) => (b.disabled = true));
  Object.assign(bench, { active: true, idx: 0, warm: true, samples: [], results: [], phaseStart: performance.now() });
  state.stage = BENCH_STAGES[0];
  setStageChip(state.stage);
  buildStage(state.stage);
  el('bench-results').hidden = true;
});

function benchStep(now, dt) {
  const elapsed = now - bench.phaseStart;
  const id = BENCH_STAGES[bench.idx];
  el('bench-status').textContent = `Measuring ${STAGES.find((st) => st.id === id).label}… (${bench.idx + 1} of ${BENCH_STAGES.length})`;
  if (bench.warm) {
    if (elapsed > 1000) { bench.warm = false; bench.phaseStart = now; bench.samples = []; }
    return;
  }
  bench.samples.push(dt);
  if (elapsed < 5000) return;
  const sorted = [...bench.samples].sort((a, b) => b - a);
  const worst = sorted[Math.max(0, Math.floor(sorted.length * 0.01) - 1)] || sorted[0];
  bench.results.push({
    stage: STAGES.find((st) => st.id === id).label,
    fps: bench.samples.length / (elapsed / 1000),
    low: 1000 / worst,
    buildings: stats.buildings,
    draws: renderer.info.render.calls,
    tris: renderer.info.render.triangles,
  });
  bench.idx++;
  if (bench.idx >= BENCH_STAGES.length) return finishBench();
  state.stage = BENCH_STAGES[bench.idx];
  setStageChip(state.stage);
  buildStage(state.stage);
  bench.warm = true;
  bench.phaseStart = performance.now();
}

function finishBench() {
  bench.active = false;
  state.benchmarking = false;
  document.querySelectorAll('.chips button, #bench-btn').forEach((b) => (b.disabled = false));
  const cls = (f) => (f >= 50 ? 'good' : f >= 28 ? 'warn' : 'bad');
  el('bench-rows').replaceChildren(
    ...bench.results.map((r) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${r.stage}</td><td class="${cls(r.fps)}">${r.fps.toFixed(0)}</td><td class="${cls(r.low)}">${r.low.toFixed(0)}</td>`;
      return tr;
    })
  );
  const lines = [
    `Yuhome spike benchmark · quality ${QUALITY[state.quality].label} · ${state.yusians} Yusians`,
    `Device: ${device}`,
    `Canvas: ${renderer.domElement.width}×${renderer.domElement.height}`,
    ...bench.results.map((r) => `${r.stage}: ${r.fps.toFixed(1)} fps avg, ${r.low.toFixed(1)} fps 1% low, ${r.buildings} buildings, ${r.draws} draws, ${fmt(r.tris)} tris`),
  ];
  el('copy-text').value = lines.join('\n');
  el('bench-results').hidden = false;
  el('bench-status').textContent = 'Done. Copy the results and paste them into the Yuverse thread.';
}

el('copy-btn').addEventListener('click', async () => {
  const text = el('copy-text').value;
  try {
    await navigator.clipboard.writeText(text);
    el('copy-btn').textContent = 'Copied';
  } catch {
    const ta = el('copy-text');
    ta.hidden = false;
    ta.select();
    el('copy-btn').textContent = 'Select the text and copy it';
  }
});

// ---------- Loop ----------
const camGoal = new THREE.Vector3();
const lookGoal = new THREE.Vector3();
let last = performance.now();
const t0 = performance.now();
let firstFrame = true;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  const dtMs = now - last;
  last = now;
  updateYusians(dt, now / 1000);

  if (state.view === 'street' && state.yusians > 0) {
    camGoal.copy(followPos).addScaledVector(followDir, -8).add(v.set(0, 4.5, 0));
    camera.position.lerp(camGoal, 1 - Math.pow(0.02, dt));
    lookGoal.copy(followPos).addScaledVector(followDir, 4).add(v.set(0, 1, 0));
    camera.lookAt(lookGoal);
  } else {
    controls.update();
  }

  for (const o of outlines) o.count = o.userData.source.count;
  renderer.info.reset();
  renderer.render(scene, camera);
  if (firstFrame) {
    firstFrame = false;
    window.__firstFrameMs = now - t0;
  }
  frameTimes.push(dtMs);
  if (bench.active) benchStep(now, dtMs);
  updateHud(now);
  requestAnimationFrame(frame);
}

buildStage(state.stage);
applyQuality();
requestAnimationFrame(frame);
window.__spike = { state, renderer, stats: () => stats, bench };
