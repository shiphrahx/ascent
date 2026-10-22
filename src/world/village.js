// Stone village under the castle (flat roofs, parapets, chimneys, doors, lit windows),
// the old stone arch bridge over the river, and dry-stone field walls.
import * as THREE from 'three';
import { propMaterial, tag, merge, cyl } from '../balloon/props.js';
import { addCaster } from '../core/mat.js';
import { mulberry32, simplex2 } from '../core/noise.js';
import { SITES, RIVER } from './layout.js';
import { WORLD } from '../core/shared.js';

const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); return g; };

function house(rng) {
  const parts = [];
  const w = 5 + rng() * 4, d = 4.5 + rng() * 3.5, h = 3.2 + rng() * 1.8;
  const twoStory = rng() < 0.35;
  const stone = [1, 0.96 + rng() * 0.06, 0.9 + rng() * 0.1];
  // main block with a deep foundation for slopes
  parts.push(tag(box(w, h + 5, d, 0, -5, 0), 15, stone));
  // roof slab with a parapet lip
  parts.push(tag(box(w - 0.3, 0.12, d - 0.3, 0, h, 0), 16, [1, 1, 1]));
  for (const [pw, pd, px, pz] of [[w, 0.3, 0, d / 2 - 0.15], [w, 0.3, 0, -d / 2 + 0.15], [0.3, d, w / 2 - 0.15, 0], [0.3, d, -w / 2 + 0.15, 0]])
    parts.push(tag(box(pw, 0.4, pd, px, h, pz), 15, stone));
  let topH = h;
  if (twoStory) {
    const w2 = w * (0.45 + rng() * 0.2), d2 = d * (0.6 + rng() * 0.2), h2 = 2.6 + rng() * 0.6;
    const ox = (rng() - 0.5) * (w - w2) * 0.8, oz = -(d - d2) / 2 + 0.2;
    parts.push(tag(box(w2, h2, d2, ox, h, oz), 15, stone));
    parts.push(tag(box(w2 - 0.2, 0.12, d2 - 0.2, ox, h + h2, oz), 16, [1, 1, 1]));
    parts.push(tag(box(w2 + 0.1, 0.3, 0.25, ox, h + h2, oz + d2 / 2 - 0.12), 15, stone));
    parts.push(tag(box(0.7, 1.0, 0.1, ox + w2 * 0.15, h + 0.9, oz + d2 / 2 + 0.03), 18));
    topH = h + h2;
  }
  // chimney with a cap
  const cx = (rng() - 0.5) * (w - 1.4), cz = -d / 2 + 0.8 + rng() * 1.2;
  const chH = (twoStory ? topH : h) + 1.1;
  parts.push(tag(box(0.55, chH - (twoStory ? 0 : h) + (twoStory ? 0 : 0), 0.55, cx, twoStory ? 0 : h, cz), 15, stone));
  parts.push(tag(box(0.8, 0.1, 0.8, cx, (twoStory ? 0 : h) + chH - (twoStory ? 0 : h), cz), 15, stone));
  // front: arched or square door, windows with sills
  const doorX = (rng() - 0.5) * (w - 2.4);
  parts.push(tag(box(1.0, 2.0, 0.12, doorX, 0, d / 2 + 0.01), 17, [1, 0.9 + rng() * 0.2, 0.8]));
  parts.push(tag(box(1.35, 0.25, 0.2, doorX, 2.0, d / 2 + 0.05), 15, stone));
  const nw = 1 + Math.floor(rng() * 3);
  for (let k = 0; k < nw; k++) {
    let wx = -w / 2 + 0.9 + rng() * (w - 1.8);
    if (Math.abs(wx - doorX) < 1.2) wx = doorX + (wx < doorX ? -1.3 : 1.3);
    if (Math.abs(wx) > w / 2 - 0.6) continue;
    parts.push(tag(box(0.6, 0.85, 0.1, wx, 1.3, d / 2 + 0.02), 18));
    parts.push(tag(box(0.8, 0.08, 0.22, wx, 1.22, d / 2 + 0.06), 15, stone));
  }
  // side window
  parts.push(tag(box(0.1, 0.8, 0.6, w / 2 + 0.02, 1.4, (rng() - 0.5) * (d - 1.6)), 18));
  // a low courtyard wall in front on some
  if (rng() < 0.4) {
    const cw = w + 2, cd = 3 + rng() * 2;
    parts.push(tag(box(cw, 1.2, 0.4, 0, -1, d / 2 + cd), 15, stone));
    parts.push(tag(box(0.4, 1.2, cd, -cw / 2 + 0.2, -1, d / 2 + cd / 2), 15, stone));
    parts.push(tag(box(0.4, 1.2, cd * 0.5, cw / 2 - 0.2, -1, d / 2 + cd * 0.75), 15, stone));
  }
  // external stair to the roof
  if (rng() < 0.4) for (let s = 0; s < 10; s++) parts.push(tag(box(0.9, h * (s + 1) / 10, 0.35, -w / 2 - 0.45, -0.2, -d / 2 + 0.4 + s * 0.35), 15, stone));
  return { geo: merge(parts), w, d, chimney: new THREE.Vector3(cx, (twoStory ? 0 : h) + chH - (twoStory ? 0 : h) + 0.1, cz), h: topH };
}

function bridgeGeo() {
  // local: x along the bridge, z across, y up from the water
  const parts = [];
  const L = 52, Wd = 4.4;
  const spans = [{ c: 0, s: 13 }, { c: -14.5, s: 9 }, { c: 14.5, s: 9 }];
  const deckY = x => 7.4 - 4.8 * Math.pow(Math.abs(x) / (L / 2), 1.7);
  // spandrel walls with arch openings, extruded across the width
  const shape = new THREE.Shape();
  const N = 40;
  shape.moveTo(-L / 2, -2);
  for (let i = 0; i <= N; i++) { const x = -L / 2 + L * i / N; shape.lineTo(x, deckY(x) - 0.35); }
  shape.lineTo(L / 2, -2);
  shape.lineTo(-L / 2, -2);
  for (const sp of spans) {
    const hole = new THREE.Path();
    const r = sp.s / 2, spring = sp.c === 0 ? 1.2 : 0.8;
    hole.moveTo(sp.c - r, -2);
    hole.lineTo(sp.c - r, spring);
    for (let i = 0; i <= 24; i++) { const a = Math.PI - i / 24 * Math.PI; hole.lineTo(sp.c + Math.cos(a) * r, spring + Math.sin(a) * r * 0.92); }
    hole.lineTo(sp.c + r, -2);
    hole.lineTo(sp.c - r, -2);
    shape.holes.push(hole);
  }
  const body = new THREE.ExtrudeGeometry(shape, { depth: Wd, bevelEnabled: false, curveSegments: 4 });
  body.translate(0, 0, -Wd / 2);
  parts.push(tag(body, 15, [0.98, 0.94, 0.86]));
  // voussoirs: dressed stones ringing each arch, slightly proud of the wall
  const rng = mulberry32(5);
  for (const sp of spans) {
    const r = sp.s / 2, spring = sp.c === 0 ? 1.2 : 0.8;
    const n = Math.round(Math.PI * r / 0.55);
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI - (i + 0.5) / n * Math.PI;
      const cx = sp.c + Math.cos(a0) * (r + 0.4), cy = spring + Math.sin(a0) * (r * 0.92 + 0.4);
      for (const side of [-1, 1]) {
        const g = new THREE.BoxGeometry(0.5, 0.8 + rng() * 0.1, 0.25);
        g.rotateZ(a0 - Math.PI / 2);
        g.translate(cx, cy, side * (Wd / 2 + 0.06));
        const v = 0.85 + rng() * 0.2;
        parts.push(tag(g, 15, [v, v * 0.95, v * 0.88]));
      }
    }
    // soffit: the underside of the arch barrel
    const soffit = new THREE.CylinderGeometry(r, r, Wd, 24, 1, true, Math.PI / 2, Math.PI);
    soffit.rotateX(Math.PI / 2);
    soffit.rotateZ(-Math.PI / 2);
    soffit.scale(1, 0.92, 1);
    soffit.translate(sp.c, spring, 0);
    const p = soffit.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < spring - 0.01) p.setY(i, spring);
    soffit.computeVertexNormals();
    parts.push(tag(soffit, 15, [0.9, 0.86, 0.8]));
  }
  // cutwaters on the piers, upstream and downstream
  for (const px of [-7.25 + 0.0, 7.25]) {
    const piersX = px < 0 ? -(13 / 2 + 1.0) : 13 / 2 + 1.0;
    for (const side of [-1, 1]) {
      const cw = new THREE.ConeGeometry(1.6, 4.5, 4, 1);
      cw.rotateY(Math.PI / 4);
      cw.scale(0.75, 1, 1.0);
      cw.translate(piersX, 0.25, side * (Wd / 2 + 0.7));
      parts.push(tag(cw, 15, [0.95, 0.9, 0.82]));
    }
  }
  // parapets with coping, and a cobbled deck
  for (const side of [-1, 1]) {
    for (let i = 0; i < 26; i++) {
      const x0 = -L / 2 + L * i / 26, x1 = -L / 2 + L * (i + 1) / 26, xm = (x0 + x1) / 2;
      const y0 = deckY(xm);
      const seg = new THREE.BoxGeometry(x1 - x0 + 0.02, 0.8, 0.38);
      const ang = Math.atan2(deckY(x1) - deckY(x0), x1 - x0);
      seg.rotateZ(ang);
      seg.translate(xm, y0 + 0.4, side * (Wd / 2 - 0.19));
      parts.push(tag(seg, 15, [1, 0.96, 0.9]));
      const cap = new THREE.BoxGeometry(x1 - x0 + 0.02, 0.12, 0.46);
      cap.rotateZ(ang); cap.translate(xm, y0 + 0.86, side * (Wd / 2 - 0.19));
      parts.push(tag(cap, 15, [0.85, 0.8, 0.72]));
      if (side === 1) {
        const deck = new THREE.BoxGeometry(x1 - x0 + 0.02, 0.2, Wd - 0.7);
        deck.rotateZ(ang); deck.translate(xm, y0 - 0.1, 0);
        parts.push(tag(deck, 16, [0.95, 0.92, 0.88]));
      }
    }
  }
  return merge(parts);
}

function wallSegment(rng) {
  // 4 m of dry-stone wall: two courses of irregular stones plus a capping row
  const parts = [];
  for (let c = 0; c < 3; c++) {
    let x = -2;
    while (x < 2) {
      const l = 0.35 + rng() * 0.35;
      const g = new THREE.BoxGeometry(l * 0.96, 0.24 + rng() * 0.08, 0.34 + rng() * 0.1);
      g.rotateY((rng() - 0.5) * 0.25); g.rotateZ((rng() - 0.5) * 0.12);
      g.translate(x + l / 2, -0.3 + c * 0.3 + (c === 2 ? 0.05 : 0), (rng() - 0.5) * 0.06);
      const v = 0.75 + rng() * 0.3;
      parts.push(tag(g, 15, [v, v * 0.95, v * 0.88]));
      x += l * 0.92;
    }
  }
  return merge(parts);
}

export class Village {
  constructor(scene, data, rocks) {
    this.data = data;
    const rng = mulberry32(31);
    this.mat = propMaterial(false);
    this.chimneys = [];
    this.lamps = [];
    this.windows = [];
    const variants = [];
    for (let k = 0; k < 8; k++) variants.push({ ...house(rng), list: [] });
    // place houses on the castle slopes and down toward the river
    const c = SITES.castle;
    const placed = [];
    for (let i = 0; i < 16000 && placed.length < 320; i++) {
      const a = rng() * Math.PI * 2, r = 46 + Math.pow(rng(), 1.6) * 280;
      let x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      // the village spills east and south toward the river valley
      x += Math.max(0, Math.cos(a)) * r * 0.35;
      const vt = data.sampleArr(data.valleyT, x, z);
      if (vt < 0.5 && data.sampleArr(data.valleyId, x, z) !== 3) continue;
      const n = data.normal(x, z);
      if (n.y < 0.8) continue;
      const v = variants[Math.floor(rng() * variants.length)];
      const rad = Math.hypot(v.w, v.d) / 2 + 0.4;
      if (placed.some(p => Math.hypot(p.x - x, p.z - z) < p.rad + rad)) continue;
      let clash = false;
      for (const o of rocks.near(x, z)) if (Math.hypot(o.x - x, o.z - z) < o.rb + rad) clash = true;
      if (clash) continue;
      const rot = Math.atan2(n.x, n.z) + (rng() - 0.5) * 0.5;
      let gy = -1e9;
      const cr = Math.cos(rot), sr = Math.sin(rot);
      for (const [lx, lz] of [[-v.w / 2, -v.d / 2], [v.w / 2, -v.d / 2], [-v.w / 2, v.d / 2], [v.w / 2, v.d / 2], [0, 0]])
        gy = Math.max(gy, data.height(x + lx * cr + lz * sr, z - lx * sr + lz * cr));
      const p = { x, z, y: gy - 0.05, rot, rad, v };
      placed.push(p); v.list.push(p);
      const ch = v.chimney.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), rot).add(new THREE.Vector3(x, p.y, z));
      this.chimneys.push(ch);
      this.windows.push(new THREE.Vector3(x, p.y + 1.5, z));
    }
    this.houses = placed;
    this.group = new THREE.Group();
    scene.add(this.group);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (const v of variants) {
      if (!v.list.length) continue;
      const im = new THREE.InstancedMesh(v.geo, this.mat, v.list.length);
      v.list.forEach((p, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot); m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); });
      addCaster(im);
      this.group.add(im);
      // the river's reflection draws only the houses near the water (it's vertex-bound, not pixel)
      const bank = v.list.filter(p => data.riverD[Math.floor((p.z - WORLD.core.minZ) / data.cell) * data.nx + Math.floor((p.x - WORLD.core.minX) / data.cell)] < 120);
      if (bank.length) {
        const rm = new THREE.InstancedMesh(v.geo, this.mat, bank.length);
        bank.forEach((p, i) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot); m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(1, 1, 1)); rm.setMatrixAt(i, m4); });
        rm.layers.set(2);
        this.group.add(rm);
      }
    }
    // street lamps between houses
    for (let i = 0; i < placed.length; i += 5) {
      const p = placed[i];
      const lx = p.x + Math.cos(p.rot) * (p.v.w / 2 + 2), lz = p.z - Math.sin(p.rot) * (p.v.w / 2 + 2);
      this.lamps.push(new THREE.Vector3(lx, data.height(lx, lz) + 3.6, lz));
    }
    const lampGeo = merge([tag(cyl(0.06, 0.05, 3.5, 6), 2, [0.2, 0.2, 0.2]), tag(box(0.3, 0.35, 0.3, 0, 3.4, 0), 18)]);
    const lamps = new THREE.InstancedMesh(lampGeo, this.mat, this.lamps.length);
    this.lamps.forEach((l, i) => { m4.makeTranslation(l.x, l.y - 3.6, l.z); lamps.setMatrixAt(i, m4); });
    this.group.add(lamps);

    // bridge across the river
    let best = null, bd = 1e9;
    for (let i = 0; i < RIVER.length - 1; i++) {
      const d = Math.hypot(RIVER[i][0] - SITES.bridge.x, RIVER[i][1] - SITES.bridge.z);
      if (d < bd) { bd = d; best = i; }
    }
    const a = RIVER[best], b = RIVER[best + 1];
    const flowAng = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const bg = bridgeGeo();
    const bridge = new THREE.Mesh(bg, this.mat);
    // bridge axis perpendicular to the flow
    bridge.position.set(a[0], WORLD.riverY - 0.2, a[1]);
    bridge.rotation.y = -(flowAng + Math.PI / 2);
    bridge.layers.enable(2);
    addCaster(bridge);
    this.group.add(bridge);
    this.bridge = { x: a[0], z: a[1], ang: flowAng };
    rocks.addCollider({ x: a[0], z: a[1], y: WORLD.riverY, h: 8, r: 24 });

    // dry-stone walls along field edges in the floodplain and around the orchard and vineyard
    const segs = [];
    const segGeo = [0, 1, 2].map(k => wallSegment(mulberry32(70 + k)));
    const lines = [];
    // floodplain field grid (matches the patchwork in the terrain attributes)
    const ux = [0.8, 0.6], uz = [-0.6, 0.8];
    for (let gx = -40; gx < 40; gx++) for (let gz = -40; gz < 40; gz++) {
      // cell corner in rotated field space -> world
      const s0 = gx * 70, t0 = gz * 46;
      const wx = s0 * ux[0] + t0 * uz[0], wz = s0 * ux[1] + t0 * uz[1];
      if (Math.abs(wx - 300) > 900 || Math.abs(wz) > 1250) continue;
      if (rng() < 0.55) lines.push([[wx, wz], [wx + 70 * ux[0], wz + 70 * ux[1]]]);
      if (rng() < 0.45) lines.push([[wx, wz], [wx + 46 * uz[0], wz + 46 * uz[1]]]);
    }
    const ringAround = (cx, cz, r, n) => { const pts = []; for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2; pts.push([cx + Math.cos(t) * r * (1 + 0.08 * Math.sin(t * 3)), cz + Math.sin(t) * r]); } for (let i = 0; i < n; i++) if (i % 9 !== 0) lines.push([pts[i], pts[i + 1]]); };
    ringAround(SITES.orchard.x, SITES.orchard.z, SITES.orchard.r * 0.8, 40);
    for (const [p0, p1] of lines) {
      const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const n = Math.floor(L / 4);
      const ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = p0[0] + (p1[0] - p0[0]) * t, z = p0[1] + (p1[1] - p0[1]) * t;
        const rd = data.riverD[Math.floor((z - WORLD.core.minZ) / data.cell) * data.nx + Math.floor((x - WORLD.core.minX) / data.cell)];
        const soil = data.attr(x, z, 1);
        if (!(rd > 22 && (soil > 0.4 || Math.hypot(x - SITES.orchard.x, z - SITES.orchard.z) < SITES.orchard.r))) continue;
        const nrm = data.normal(x, z);
        if (nrm.y < 0.93) continue;
        segs.push({ x, z, y: data.height(x, z) - 0.05, ang, k: Math.floor(rng() * 3) });
      }
    }
    // walls are tiled so far tiles can drop to a plain low wall and distant ones vanish
    const lowGeo = tag(box(4, 0.85, 0.42, 0, -0.42, 0), 15, [0.88, 0.84, 0.78]);
    this.wallTiles = new Map();
    for (const s of segs) {
      const key = Math.floor(s.x / 400) + ',' + Math.floor(s.z / 400);
      if (!this.wallTiles.has(key)) this.wallTiles.set(key, []);
      this.wallTiles.get(key).push(s);
    }
    const up = new THREE.Vector3(0, 1, 0);
    this.tiles = [];
    for (const list of this.wallTiles.values()) {
      const tile = { hi: [], lo: null, c: new THREE.Vector3() };
      for (const s of list) tile.c.add(new THREE.Vector3(s.x, s.y, s.z));
      tile.c.divideScalar(list.length);
      for (let k = 0; k < 3; k++) {
        const sub = list.filter(s => s.k === k);
        if (!sub.length) continue;
        const im = new THREE.InstancedMesh(segGeo[k], this.mat, sub.length);
        sub.forEach((s, i) => { q.setFromAxisAngle(up, -s.ang); m4.compose(new THREE.Vector3(s.x, s.y + 0.3, s.z), q, new THREE.Vector3(1, 1, 1)); im.setMatrixAt(i, m4); });
        // too low to show in the river's reflection
        im.computeBoundingSphere();
        addCaster(im);
        this.group.add(im);
        tile.hi.push(im);
      }
      const lo = new THREE.InstancedMesh(lowGeo, this.mat, list.length);
      list.forEach((s, i) => { q.setFromAxisAngle(up, -s.ang); m4.compose(new THREE.Vector3(s.x, s.y + 0.3, s.z), q, new THREE.Vector3(1, 1, 1)); lo.setMatrixAt(i, m4); });
      lo.computeBoundingSphere();
      this.group.add(lo);
      tile.lo = lo;
      this.tiles.push(tile);
    }
    this.wallCount = segs.length;
  }
  update(camera) {
    for (const t of this.tiles) {
      const d = camera.position.distanceTo(t.c);
      // whole tiles dither from detailed to simple over 360-400 m instead of swapping in one frame
      const f = Math.max(0, Math.min(1, (d - 360) / 40));
      for (const m of t.hi) m.visible = f < 1;
      t.lo.visible = f > 0 && d < 2600;
      if (f !== t.fade) { t.fade = f; for (const m of t.hi) this.setFade(m, f, 1); this.setFade(t.lo, f, -1); }
    }
  }
  // the fade rides in each instance matrix's unused bottom row (see props.js); only rewritten when it changes
  setFade(mesh, f, side) {
    const a = mesh.instanceMatrix.array;
    for (let i = 0; i < mesh.count; i++) { a[i * 16 + 3] = f; a[i * 16 + 7] = f > 0 && f < 1 ? side : 0; }
    mesh.instanceMatrix.needsUpdate = true;
  }
}
