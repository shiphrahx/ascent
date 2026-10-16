// Carved landmarks: the rock-cut church and the dovecote cliffs (relief facades set into cliffs
// that are sculpted flat into the heightfield first), and the honeycombed rock castle.
import * as THREE from 'three';
import { simplex2 } from '../core/noise.js';
import { makeMaterial, addCaster } from '../core/mat.js';
import { ROCK_VERT, ROCK_FRAG, lathe, toGeometry, rills } from './rocks.js';
import { VALLEYS, SITES } from './layout.js';
import { WORLD } from '../core/shared.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// nearest point on a valley's centreline
function nearestOnValley(id, x, z) {
  const pts = VALLEYS.find(v => v.id === id).pts;
  let best = null, bd = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(px - x, pz - z);
    if (d < bd) { bd = d; const l = Math.sqrt(L2); best = { x: px, z: pz, tx: dx / l, tz: dz / l }; }
  }
  return best;
}

// facade descriptor: foot origin on the valley floor, normal pointing into the valley
function facadeSite(valleyId, sx, sz, offset, W, H, along = 0) {
  const c = nearestOnValley(valleyId, sx, sz);
  // which side of the valley is the site on
  const nx0 = -c.tz, nz0 = c.tx;
  const side = (sx - c.x) * nx0 + (sz - c.z) * nz0 >= 0 ? 1 : -1;
  const ox = c.x + c.tx * along + nx0 * side * offset, oz = c.z + c.tz * along + nz0 * side * offset;
  return { x: ox, z: oz, nx: -nx0 * side, nz: -nz0 * side, tx: c.tx * -side, tz: c.tz * -side, W, H, cx: c.x + c.tx * along, cz: c.z + c.tz * along };
}

// slide the facade along its normal to the foot of the real wall
function seatFacade(data, f) {
  let floor = 1e9;
  for (let s = 0; s <= 80; s += 2) floor = Math.min(floor, data.heightCore(f.cx - f.nx * s * 0 + (f.x - f.cx) * s / 80, f.cz + (f.z - f.cz) * s / 80));
  // march outward from the valley centre until the ground starts climbing the wall
  const dx = -f.nx, dz = -f.nz;
  let best = 0;
  for (let s = 0; s < 200; s += 1) {
    const x = f.cx + dx * s, z = f.cz + dz * s;
    let h = 0;
    for (const a of [-f.W / 3, 0, f.W / 3]) h += data.heightCore(x + f.tx * a, z + f.tz * a);
    if (h / 3 > floor + 5) { best = s - 3; break; }
  }
  f.x = f.cx + dx * best; f.z = f.cz + dz * best;
  f.floorY = floor;
}

export function defineFacades() {
  const V = (id) => VALLEYS.find(v => v.id === id);
  const church = facadeSite('chimney', SITES.church.x, SITES.church.z - 200, V('chimney').floorHalf - 10, 30, 24, 0);
  const dove1 = facadeSite('pigeon', SITES.dovecote.x, SITES.dovecote.z + 100, V('pigeon').floorHalf - 4, 22, 16, -10);
  const dove2 = facadeSite('pigeon', SITES.dovecote.x, SITES.dovecote.z - 100, V('pigeon').floorHalf - 4, 20, 15, 45);
  church.kind = 'church'; dove1.kind = 'dove'; dove2.kind = 'dove';
  return [church, dove1, dove2];
}

// carve a vertical cliff into the heightfield where each facade stands
export function sculpt(data, facades) {
  const C = WORLD.core;
  for (const f of facades) {
    seatFacade(data, f);
    const floorY = f.floorY;
    const top = floorY + f.H + 3;
    const R = f.W / 2 + 24;
    const i0 = Math.floor((f.x - R - C.minX) / data.cell), i1 = Math.ceil((f.x + R - C.minX) / data.cell);
    const j0 = Math.floor((f.z - R - C.minZ) / data.cell), j1 = Math.ceil((f.z + R - C.minZ) / data.cell);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = C.minX + (i + 0.5) * data.cell, z = C.minZ + (j + 0.5) * data.cell;
      const a = (x - f.x) * f.tx + (z - f.z) * f.tz;
      const b = (x - f.x) * f.nx + (z - f.z) * f.nz;
      const k = j * data.nx + i;
      // ragged side boundary so the cut reads as a natural cliff, not a block
      const jag = 5 * simplex2(b / 9 + f.x, a / 9) + 3 * simplex2(b / 3, a / 3 + f.z);
      const wa = smooth(f.W / 2 + 16, f.W / 2 + 3, Math.abs(a) + jag);
      if (wa <= 0) continue;
      let h = data.H[k];
      // the terrain cliff stands 8 m behind the facade plane so the carved rooms have space;
      // the facade's rolled-back edges close the gap
      if (b < -8) {
        const tgt = Math.max(h, top + 4 * simplex2(a / 7, b / 7));
        h = h + (tgt - h) * wa * smooth(-40, -20, b + jag);
      } else if (b < 9) {
        // a level apron in front so the foot meets the valley floor cleanly
        h = h + (floorY - h) * wa * smooth(9, 3, b);
      }
      data.H[k] = h;
    }
  }
}

function buildFacade(f, carve, res) {
  const W = f.W + 6, H = f.H + 8;
  const nu = Math.ceil(W / res), nv = Math.ceil(H / res);
  const pos = [], mat = [], ao = [], paint = [], idx = [];
  for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
    const u = -W / 2 + i / nu * W, v = -2 + j / nv * H;
    const c = carve(u, v);
    // natural rock relief, quieter on dressed surfaces
    let z = (0.22 * simplex2(u / 4.1, v / 4.1) + 0.05 * simplex2(u / 1.2, v / 1.2) + 0.015 * simplex2(u * 3, v * 3)) * (c.dressed ? 0.2 : 1);
    // vertical erosion runnels
    z -= 0.08 * Math.pow(Math.abs(Math.sin(u * 1.3 + simplex2(v * 0.08, u * 0.3) * 2)), 6) * (c.dressed ? 0.2 : 1);
    z -= c.d;
    // edges roll back into the cliff so the facade never shows a seam
    // ragged outline so the face reads as part of the cliff
    const rag = 2.2 * simplex2(v / 5 + (u > 0 ? 7 : 0), 1.3) + 1.2 * simplex2(v / 1.7, u > 0 ? 3 : 9);
    const ragT = 2.5 * simplex2(u / 6, 4.2) + 1.0 * simplex2(u / 2, 8.1);
    const eu = Math.abs(u) - (f.W / 2 - 3 + rag), ev = v - (f.H - 3 + ragT);
    if (eu > 0) z -= eu * eu * 0.7;
    if (ev > 0) z -= ev * ev * 0.5;
    if (v < 0) z -= v * v * 0.2;
    pos.push(u, v, z + 0.35);
    mat.push(c.mat || 0); ao.push(c.ao ?? 1);
    paint.push(...(c.paint || [0, 0, 0, 0]));
  }
  const Wn = nu + 1;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * Wn + i, b = a + 1, c = a + Wn, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(mat, 1));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  g.setAttribute('aPaint', new THREE.Float32BufferAttribute(paint, 4));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// arch helper: inside test and distance to the edge for an opening with a round head
function arch(u, v, cu, w, h) {
  const hw = w / 2, du = u - cu;
  const sp = h - hw;
  if (v < 0 || Math.abs(du) > hw) return -Math.min(Math.abs(Math.abs(du) - hw), Math.abs(v));
  if (v <= sp) return Math.min(hw - Math.abs(du), v);
  const r = Math.hypot(du, v - sp);
  return hw - r;
}

function churchCarve(u, v) {
  let d = 0, mat = 0, ao = 1, dressed = false;
  const soft = (e, w = 0.06) => smooth(-w, w, e);
  // portico recess with a round head
  const porch = arch(u, v, 0, 9.2, 7.6);
  if (porch > -0.3) { const k = soft(porch, 0.08); d = Math.max(d, 1.9 * k); dressed = true; ao = Math.min(ao, 0.75 + 0.25 * smooth(0, 1.2, porch)); }
  // two free-standing columns inside the portico, with capitals and bases
  for (const cu of [-2.5, 2.5]) {
    const du = Math.abs(u - cu);
    let r = 0.42;
    if (v > 5.7 && v < 6.3) r = 0.62; else if (v > 5.3 && v < 5.7) r = 0.42 + (v - 5.3) * 0.5;
    if (v < 0.4) r = 0.6; else if (v < 0.6) r = 0.5;
    if (v < 6.3 && du < r) { const front = 1.15 - Math.sqrt(r * r - du * du); d = Math.min(d, Math.max(0, front)); ao = Math.max(ao, 0.9); }
  }
  // main door, deep and dark
  const door = arch(u, v, 0, 2.5, 4.3);
  if (door > -0.1) { const k = soft(door, 0.05); d = Math.max(d, 1.9 + 4 * k); if (door > 0.02) { mat = 2; ao = 0.3; } }
  for (const cu of [-3.7, 3.7]) {
    const sd = arch(u, v, cu, 0.95, 2.5);
    if (sd > -0.08 && porch > 0.3) { d = Math.max(d, 1.9 + 3 * soft(sd, 0.04)); if (sd > 0.02) { mat = 2; ao = 0.35; } }
  }
  // cornices
  if (v > 8.3 && v < 8.75 && Math.abs(u) < 8.2) { d = Math.min(d, -0.28); dressed = true; }
  if (v > 12.1 && v < 12.5 && Math.abs(u) < 8.2) { d = Math.min(d, -0.25); dressed = true; }
  // blind arcade between the cornices
  if (v > 8.75 && v < 12.1 && Math.abs(u) < 8) {
    dressed = true;
    for (let k = -3; k <= 3; k++) {
      const a = arch(u, v - 9.1, k * 2.25, 1.5, 2.7);
      if (a > -0.05) { d = Math.max(d, 0.5 * soft(a, 0.04)); ao = Math.min(ao, 0.7 + 0.3 * smooth(0, 0.3, a)); }
    }
  }
  // pediment: recessed triangle with a raised border
  if (v > 12.5 && v < 17.5) {
    const half = 8 - (v - 12.5) * 1.55;
    if (Math.abs(u) < half) {
      dressed = true;
      const e = Math.min(half - Math.abs(u), v - 12.5);
      d = Math.max(d, e > 0.35 ? 0.22 : -0.12);
      // two small windows
      for (const cu of [-2.8, 2.8]) {
        const w = arch(u, v - 13.4, cu, 0.7, 1.5);
        if (w > -0.04) { d = Math.max(d, 0.22 + 2.4 * soft(w, 0.03)); if (w > 0.02) { mat = 3; ao = 0.35; } }
      }
    }
  }
  // collapsed corner revealing an inner chamber
  const cn = simplex2(u * 0.35, v * 0.35) * 1.2;
  const cd = Math.hypot((u + 10.5) / 2.6, (v - 5) / 3.2) + cn * 0.25;
  if (cd < 1) { d = Math.max(d, 2.6 * smooth(1, 0.7, cd)); if (cd < 0.75) { mat = 2; ao = 0.4; } }
  // rock-cut steps climbing to it
  for (let s = 0; s < 10; s++) {
    const su = -6.4 - s * 0.5, sv = s * 0.38;
    if (u > su - 0.5 && u < su && v > sv && v < sv + 0.38) { d = Math.max(d, 0.55); ao = Math.min(ao, 0.7); dressed = true; }
  }
  return { d, mat, ao, dressed };
}

function doveCarve(u, v, variant) {
  let d = 0, mat = 0, ao = 1, dressed = false, paint = null;
  const rows = variant ? [6.2, 7.3, 8.4] : [7.4, 8.55, 9.7, 10.85];
  const hw = variant ? 5.2 : 6.4;
  const top = rows[rows.length - 1] + 0.75, bot = rows[0] - 0.55;
  const white = [0.9, 0.87, 0.8], ochre = [0.62, 0.24, 0.13];
  const wear = 0.55 + 0.4 * smooth(-0.3, 0.5, simplex2(u * 0.7, v * 0.7));
  if (Math.abs(u) < hw + 0.45 && v > bot - 0.45 && v < top + 0.9) {
    dressed = true;
    // painted frame: white border, ochre stripes between rows, zigzag frieze on top
    const inFrame = Math.abs(u) < hw && v > bot && v < top;
    if (!inFrame) paint = [...white, 0.85 * wear];
    else paint = [...white, 0.35 * wear];
    if (v > top && v < top + 0.9) {
      const zz = Math.abs(((u * 1.6) % 2 + 2) % 2 - 1);
      paint = (v - top) / 0.9 < zz ? [...ochre, 0.85 * wear] : [...white, 0.8 * wear];
    }
    for (let r = 0; r < rows.length - 1; r++) {
      const mid = (rows[r] + rows[r + 1]) / 2 + 0.28;
      if (Math.abs(v - mid) < 0.09 && inFrame) paint = [...ochre, 0.9 * wear];
    }
  }
  for (const rv of rows) {
    if (v < rv - 0.05 || v > rv + 0.5 || Math.abs(u) > hw) continue;
    const cu = Math.round(u / 0.56) * 0.56;
    const a = arch(u, v - rv, cu, 0.28, 0.42);
    if (a > -0.04) { d = Math.max(d, 0.55 * smooth(-0.04, 0.03, a)); if (a > 0.015) { mat = 2; ao = 0.25; paint = null; } }
    // a little perching ledge under each row
    if (v > rv - 0.12 && v < rv - 0.02) d = Math.min(d, -0.08);
  }
  // access door at the foot
  const door = arch(u, v, variant ? -3 : 2.5, 0.9, 1.8);
  if (door > -0.05) { d = Math.max(d, 2 * smooth(-0.05, 0.04, door)); if (door > 0.02) { mat = 2; ao = 0.3; } }
  return { d, mat, ao, dressed, paint };
}

// rock castle: lobed tuff mass riddled with rooms, windows, doors and tunnels
function buildCastle(rng) {
  const parts = [];
  const lobes = [
    { ox: 0, oz: 0, H: 50, R: 27, k: 1.15 },
    { ox: 22, oz: 10, H: 34, R: 18, k: 1.0 },
    { ox: -18, oz: 14, H: 27, R: 15, k: 0.9 },
  ];
  for (const L of lobes) {
    const seed = rng() * 100;
    const openings = [];
    for (let fl = 0; fl < Math.floor(L.H / 3.4); fl++) {
      const y = 2.5 + fl * 3.4 + rng() * 0.6;
      const n = 6 + Math.floor(rng() * 9);
      for (let k = 0; k < n; k++) openings.push({ th: rng() * Math.PI * 2, y, w: 0.7 + rng() * 0.9, h: 1.1 + rng() * 1.2, door: rng() < 0.25 });
    }
    const prof = (u) => {
      let r = L.R * (1 - 0.55 * Math.pow(Math.max(0, u), 1.6 * L.k)) + 1.2;
      r *= 1 + 0.12 * Math.exp(-Math.max(0, u) * 9);
      if (u > 0.9) r *= Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.9) / 0.1, 2)) * 0.7 + 0.3);
      if (u < 0) r *= 1.25;
      return r;
    };
    const rn = rills(seed, 0.09, 13);
    const body = lathe({
      NR: 300, NY: 200, H: L.H, sink: 6, ydist: u => u,
      profile: (u) => prof(u),
      rn: (th, y, r) => rn(th, y, r) + r * 0.08 * simplex2(Math.cos(th) * 2 + seed, y * 0.08) + (Math.abs(((y % 3.4) + 3.4) % 3.4 - 0.2) < 0.25 ? -0.25 : 0),
      carve: (th, y, r) => {
        let dr = 0, mat = 0, ao = 1;
        for (const o of openings) {
          if (Math.abs(y - o.y) > 3) continue;
          let dth = th - o.th; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
          const s = dth * r, t = y - o.y, hw = o.w / 2;
          const sp = o.h - hw;
          let inside = Math.abs(s) < hw && t > 0 && (t < sp || Math.hypot(s, t - sp) < hw);
          if (inside) { dr = Math.max(dr, o.door ? 2.5 : 1.4); mat = 2; ao = 0.3; }
        }
        return { dr, mat, ao };
      },
      ao: (u) => 0.55 + 0.45 * smooth(-0.05, 0.08, u),
      closeTop: 1.5,
    });
    for (let i = 0; i < body.pos.length; i += 3) { body.pos[i] += L.ox; body.pos[i + 2] += L.oz; }
    parts.push(body);
  }
  return toGeometry(parts);
}

export class Landmarks {
  constructor(scene, data, facades) {
    this.group = new THREE.Group();
    scene.add(this.group);
    const mat = makeMaterial({ vertex: ROCK_VERT, fragment: ROCK_FRAG, defines: { FACADE: 1 } });
    this.mat = mat;
    for (const f of facades) {
      const geo = f.kind === 'church' ? buildFacade(f, churchCarve, 0.09) : buildFacade(f, (u, v) => doveCarve(u, v, f === facades[2]), 0.055);
      const m = new THREE.Mesh(geo, mat);
      // local x along the wall, y up, z out of the cliff into the valley
      const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(f.tx, 0, f.tz), new THREE.Vector3(0, 1, 0), new THREE.Vector3(f.nx, 0, f.nz));
      m.quaternion.setFromRotationMatrix(basis);
      m.position.set(f.x, f.floorY - 0.15, f.z);
      m.layers.enable(2);
      addCaster(m);
      this.group.add(m);
    }
    // castle on the hill
    const rng = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const cgeo = buildCastle(rng);
    const castleMat = makeMaterial({ vertex: ROCK_VERT, fragment: ROCK_FRAG, defines: { FACADE: 1 } });
    const n = cgeo.attributes.position.count;
    cgeo.setAttribute('aPaint', new THREE.Float32BufferAttribute(new Float32Array(n * 4), 4));
    const castle = new THREE.Mesh(cgeo, castleMat);
    const c = SITES.castle;
    let gy = 1e9;
    for (let a = 0; a < 8; a++) gy = Math.min(gy, data.height(c.x + Math.cos(a) * 14, c.z + Math.sin(a) * 14));
    castle.position.set(c.x, gy - 1.5, c.z);
    castle.layers.enable(2);
    addCaster(castle);
    this.group.add(castle);
    this.castle = { x: c.x, z: c.z, y: gy - 1.5, h: 52, r: 30 };
  }
}
