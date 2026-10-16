// Winter vegetation, all bending in the shared gust field: bare poplars lining the river,
// apricot orchard, pruned vines on the terraces, scrub and boulders on the plateau, and
// dry grass tufts around the camera.
import * as THREE from 'three';
import { U, WORLD, G } from '../core/shared.js';
import { VCOMMON, COMMON, WIND } from '../glsl/common.js';
import { makeMaterial, addCaster } from '../core/mat.js';
import { mulberry32, simplex2 } from '../core/noise.js';
import { SITES, RIVER, VALLEYS } from './layout.js';

const TAU = Math.PI * 2;

// ---- branching geometry ----
function buildTree(segs, sides) {
  const pos = [], nor = [], sway = [], kind = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  for (const s of segs) {
    const d = new THREE.Vector3().subVectors(s.b, s.a); const len = d.length(); d.normalize();
    const t1 = Math.abs(d.y) < 0.95 ? new THREE.Vector3().crossVectors(d, up).normalize() : new THREE.Vector3(1, 0, 0);
    const t2 = new THREE.Vector3().crossVectors(d, t1);
    const n = s.sides || sides;
    const base = pos.length / 3;
    for (let e = 0; e < 2; e++) {
      const c = e ? s.b : s.a, r = e ? s.r1 : s.r0, sw = e ? s.s1 : s.s0;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU;
        tmp.copy(t1).multiplyScalar(Math.cos(a)).addScaledVector(t2, Math.sin(a));
        pos.push(c.x + tmp.x * r, c.y + tmp.y * r, c.z + tmp.z * r);
        nor.push(tmp.x, tmp.y, tmp.z);
        sway.push(sw); kind.push(s.k || 0);
      }
    }
    for (let i = 0; i < n; i++) { const a = base + i, b = base + (i + 1) % n, c = a + n, dd = b + n; idx.push(a, b, c, b, dd, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function branch(segs, rng, a, dir, len, r, depth, sw, opt, nseg) {
  let p = a.clone(), d = dir.clone();
  const step = len / nseg;
  for (let i = 0; i < nseg; i++) {
    d.x += (rng() - 0.5) * opt.wiggle; d.z += (rng() - 0.5) * opt.wiggle; d.y += opt.lift; d.normalize();
    const q = p.clone().addScaledVector(d, step);
    const r1 = r * (1 - (i + 1) / nseg * 0.7);
    const s0 = sw + (i / nseg) * opt.swayGain * len, s1 = sw + ((i + 1) / nseg) * opt.swayGain * len;
    segs.push({ a: p, b: q, r0: r * (1 - i / nseg * 0.7), r1, s0, s1, sides: depth === 0 ? opt.trunkSides : depth === 1 ? 4 : 3, k: depth === 0 ? 0 : 1 });
    p = q;
  }
  return { tip: p, dir: d };
}

function poplar(rng, lod) {
  const segs = [];
  const H = 14 + rng() * 7;
  const opt = { wiggle: 0.08, lift: 0.02, swayGain: 0.06, trunkSides: lod ? 5 : 8 };
  const trunk = branch(segs, rng, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, 1, 0), H, 0.28, 0, 0, { ...opt, swayGain: 0.05 }, lod ? 4 : 8);
  const nb = lod ? 18 : 64;
  for (let i = 0; i < nb; i++) {
    const t = 0.1 + 0.88 * i / nb;
    const y = -0.5 + H * t;
    const ang = i * 2.39996 + rng() * 0.3;
    const tilt = 0.1 + rng() * 0.13;
    const dir = new THREE.Vector3(Math.cos(ang) * Math.sin(tilt), Math.cos(tilt), Math.sin(ang) * Math.sin(tilt));
    const L = (1.2 + 2.6 * Math.sin(Math.PI * Math.pow(t, 0.7))) * (0.8 + rng() * 0.4);
    const start = new THREE.Vector3(Math.cos(ang) * 0.12, y, Math.sin(ang) * 0.12);
    const b = branch(segs, rng, start, dir, L, 0.07 * (1 - t * 0.6), 1, t * 0.6, { ...opt, wiggle: 0.15, lift: 0.04, swayGain: 0.25 }, lod ? 2 : 3);
    const nt = lod ? 1 : 5;
    for (let k = 0; k < nt; k++) {
      const f = 0.35 + k / nt * 0.6;
      const p = start.clone().lerp(b.tip, f);
      const a2 = rng() * TAU;
      const d2 = dir.clone().add(new THREE.Vector3(Math.cos(a2) * 0.25, 0.5, Math.sin(a2) * 0.25)).normalize();
      branch(segs, rng, p, d2, 0.6 + rng() * 1.0, 0.018, 2, t * 0.6 + f * 0.4, { ...opt, wiggle: 0.3, lift: 0.08, swayGain: 0.5 }, lod ? 1 : 2);
    }
  }
  return { geo: buildTree(segs, 6), H };
}

function apricot(rng, lod) {
  const segs = [];
  const opt = { wiggle: 0.25, lift: 0.02, swayGain: 0.12, trunkSides: lod ? 5 : 7 };
  const H0 = 0.9 + rng() * 0.6;
  const tr = branch(segs, rng, new THREE.Vector3(0, -0.3, 0), new THREE.Vector3(0.05, 1, 0), H0 + 0.3, 0.13, 0, 0, opt, 2);
  const ns = 3 + Math.floor(rng() * 2);
  for (let s = 0; s < ns; s++) {
    const a = s / ns * TAU + rng() * 0.5, tilt = 0.6 + rng() * 0.3;
    const dir = new THREE.Vector3(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
    const b = branch(segs, rng, tr.tip, dir, 1.6 + rng() * 0.8, 0.075, 1, 0.1, { ...opt, wiggle: 0.3, lift: 0.08 }, lod ? 2 : 3);
    const nk = lod ? 1 : 4;
    for (let k = 0; k < nk; k++) {
      const f = 0.4 + k / nk * 0.6;
      const p = tr.tip.clone().lerp(b.tip, f);
      const a2 = a + (rng() - 0.5) * 2;
      const d2 = new THREE.Vector3(Math.cos(a2) * 0.6, 0.8, Math.sin(a2) * 0.6).normalize();
      const c = branch(segs, rng, p, d2, 0.8 + rng() * 0.7, 0.03, 2, 0.3 + f * 0.2, { ...opt, wiggle: 0.4, lift: 0.1, swayGain: 0.4 }, lod ? 1 : 2);
      if (!lod) for (let m = 0; m < 3; m++) {
        const a3 = rng() * TAU;
        branch(segs, rng, p.clone().lerp(c.tip, 0.5 + m * 0.2), new THREE.Vector3(Math.cos(a3) * 0.5, 0.9, Math.sin(a3) * 0.5).normalize(), 0.35 + rng() * 0.3, 0.012, 3, 0.6, { ...opt, wiggle: 0.5, lift: 0.1, swayGain: 0.6 }, 1);
      }
    }
  }
  return { geo: buildTree(segs, 5), H: 4 };
}

function vine(rng) {
  const segs = [];
  const opt = { wiggle: 0.35, lift: 0.0, swayGain: 0.05, trunkSides: 5 };
  const t = branch(segs, rng, new THREE.Vector3(0, -0.2, 0), new THREE.Vector3(0, 1, 0), 0.75 + rng() * 0.3, 0.05, 0, 0, opt, 3);
  for (const s of [-1, 1]) {
    const arm = branch(segs, rng, t.tip, new THREE.Vector3(s, 0.25, (rng() - 0.5) * 0.3).normalize(), 0.45 + rng() * 0.2, 0.03, 1, 0.05, { ...opt, wiggle: 0.3 }, 2);
    for (let k = 0; k < 3; k++) branch(segs, rng, t.tip.clone().lerp(arm.tip, 0.4 + k * 0.3), new THREE.Vector3((rng() - 0.5) * 0.4, 1, (rng() - 0.5) * 0.4).normalize(), 0.12 + rng() * 0.15, 0.012, 2, 0.1, { ...opt, wiggle: 0.2 }, 1);
  }
  return buildTree(segs, 4);
}

function shrub(rng) {
  // low cushion bush: clustered jittered blobs
  const parts = [];
  const n = 5 + Math.floor(rng() * 4);
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(0.35 + rng() * 0.35, 1);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) { const s = 0.75 + 0.5 * rng(); p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * 0.7, p.getZ(k) * s); }
    g.translate((rng() - 0.5) * 0.9, 0.15 + rng() * 0.2, (rng() - 0.5) * 0.9);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const g = new THREE.BufferGeometry();
  let total = parts.reduce((s, p) => s + p.attributes.position.count, 0);
  const pos = new Float32Array(total * 3); let o = 0;
  for (const p of parts) { pos.set(p.attributes.position.array, o); o += p.attributes.position.array.length; }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const cnt = pos.length / 3;
  const sw = new Float32Array(cnt), kd = new Float32Array(cnt).fill(2);
  for (let i = 0; i < cnt; i++) sw[i] = Math.max(0, pos[i * 3 + 1]) * 0.15;
  g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1));
  g.setAttribute('aKind', new THREE.BufferAttribute(kd, 1));
  return g;
}

function boulder(rng) {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const sx = 0.8 + rng() * 0.6, sy = 0.5 + rng() * 0.4, sz = 0.8 + rng() * 0.6;
  for (let k = 0; k < p.count; k++) {
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    const n = 1 + 0.25 * simplex2(x * 1.7 + y, z * 1.7 + rng() * 0.01) ;
    p.setXYZ(k, x * sx * n, y * sy * n - 0.2, z * sz * n);
  }
  g.computeVertexNormals();
  const cnt = p.count;
  g.setAttribute('aSway', new THREE.BufferAttribute(new Float32Array(cnt), 1));
  g.setAttribute('aKind', new THREE.BufferAttribute(new Float32Array(cnt).fill(3), 1));
  return g;
}

function grassTuft() {
  const pos = [], idx = [], sway = [], kind = [];
  const rng = mulberry32(3);
  for (let b = 0; b < 9; b++) {
    const a = rng() * TAU, lean = 0.2 + rng() * 0.5, h = 0.25 + rng() * 0.35, w = 0.025;
    const ox = (rng() - 0.5) * 0.15, oz = (rng() - 0.5) * 0.15;
    const dx = Math.cos(a), dz = Math.sin(a);
    const base = pos.length / 3;
    for (let s = 0; s <= 3; s++) {
      const t = s / 3;
      const x = ox + dx * lean * h * t * t, y = h * t, z = oz + dz * lean * h * t * t;
      const ww = w * (1 - t);
      pos.push(x - dz * ww, y, z + dx * ww, x + dz * ww, y, z - dx * ww);
      sway.push(t, t); kind.push(4, 4);
    }
    for (let s = 0; s < 3; s++) { const i = base + s * 2; idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---- shader ----
const VERT = /* glsl */`
${VCOMMON}
${WIND}
attribute float aSway, aKind;
uniform float uScaleH, uGrid, uCellSize;
uniform vec3 uCamGrid;
varying vec3 vWorld, vN;
varying float vKind, vSway, vSeed;
#ifdef DEPTH_PASS
varying float vDepthAlpha;
#endif
void main(){
  vec3 p = position;
  vec3 n = normal;
  vec4 wp;
  float seed;
#ifdef GRASS
  // camera-centred toroidal grid of tufts placed in the vertex shader
  float id = float(gl_InstanceID);
  vec2 cell = vec2(mod(id, uGrid), floor(id / uGrid));
  vec2 base = floor(uCamGrid.xz / uCellSize) * uCellSize;
  vec2 xz = base + (cell - uGrid * 0.5) * uCellSize;
  vec2 h2 = hash22(xz);
  xz += (h2 - 0.5) * uCellSize;
  seed = h2.x;
  vec4 at = attrAt(xz);
  vec3 tn = normalAt(xz);
  float grassy = smoothstep(0.3, 0.42, at.g) * (1. - smoothstep(0.62, 0.68, at.g)) + smoothstep(0.5, 0.58, at.g) * (1. - smoothstep(0.6, 0.62, at.g));
  grassy = max(grassy, step(at.g, 0.25) * 0.35 * step(0.6, h2.y));
  grassy *= smoothstep(0.82, 0.92, tn.y) * (1. - at.b);
  float dcam = length(xz - cameraPosition.xz);
  float sc = (0.6 + 0.8 * h2.y) * step(0.3, grassy) * smoothstep(uGrid * uCellSize * 0.5, uGrid * uCellSize * 0.3, dcam);
  float rot = h2.x * 6.283;
  p.xz = mat2(cos(rot), sin(rot), -sin(rot), cos(rot)) * p.xz;
  p *= sc;
  wp = vec4(xz.x + p.x, heightAt(xz) + p.y - 0.02, xz.y + p.z, 1.);
  vec3 root = vec3(xz.x, 0., xz.y);
#else
  wp = modelMatrix * instanceMatrix * vec4(p, 1.);
  n = mat3(modelMatrix) * mat3(instanceMatrix) * n;
  vec3 root = (modelMatrix * instanceMatrix * vec4(0, 0, 0, 1)).xyz;
  seed = fract(root.x * 0.137 + root.z * 0.371);
#endif
  // wind: whole plant leans with the local gust, tips flutter
  vec2 w = windAt(root.xz);
  float g = gustAt(root.xz);
  float s = aSway;
  float bend = s * s * uScaleH;
  vec2 flutter = vec2(sin(uTime * (3.1 + seed * 2.) + s * 6. + seed * 30.), cos(uTime * (2.7 + seed) + s * 5. + seed * 17.)) * (0.15 + g * 0.6) * s;
  wp.xz += (w * 0.06 + flutter * 0.08 * uWindStrength) * bend;
  wp.y -= length(w) * 0.01 * bend * s;
  vWorld = wp.xyz; vN = normalize(n); vKind = aKind; vSway = aSway; vSeed = seed;
#ifdef DEPTH_PASS
  vDepthAlpha = 1.;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRAG = /* glsl */`
${COMMON}
varying vec3 vWorld, vN;
varying float vKind, vSway, vSeed;
void main(){
  vec3 P = vWorld;
  if (P.y < uClipY) discard;
  vec3 V = normalize(cameraPosition - P);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float k = floor(vKind + 0.5);
  vec3 alb; float rough = 0.9, spec = 0.05, wrap = 0.3, sss = 0.;
  vec4 nz = texture(uNoise2D, vec2(P.x + P.z, P.y) * 0.9);
  if (k == 0.) {
    // trunk bark: poplar grey with darker furrows
    alb = mix(vec3(0.34, 0.31, 0.27), vec3(0.50, 0.47, 0.42), nz.r) * (0.75 + 0.3 * texture(uNoise2D, vec2(atan(N.z, N.x), P.y * 0.6)).g);
  } else if (k == 1.) {
    alb = mix(vec3(0.32, 0.26, 0.22), vec3(0.45, 0.38, 0.32), nz.g);
    // fine twigs glow a little reddish against the light
    sss = 0.4; wrap = 0.6;
  } else if (k == 2.) {
    alb = mix(vec3(0.20, 0.22, 0.13), vec3(0.32, 0.30, 0.18), nz.r) * (0.8 + 0.3 * vSeed);
    wrap = 0.5; sss = 0.2;
  } else if (k == 3.) {
    alb = mix(vec3(0.52, 0.45, 0.36), vec3(0.66, 0.58, 0.46), nz.r);
    alb = mix(alb, vec3(0.2, 0.18, 0.16), step(0.7, vSeed));
    rough = 0.85;
  } else {
    // dry winter grass, straw tips
    alb = mix(vec3(0.38, 0.36, 0.22), vec3(0.72, 0.63, 0.42), vSway) * (0.85 + 0.3 * vSeed);
    wrap = 0.8; sss = 0.5; N = normalize(N + vec3(0, 0.6, 0));
  }
  // snow along upper sides of branches and on shrubs, frost on twigs at dawn
  float up = smoothstep(0.2, 0.8, N.y);
  alb = mix(alb, vec3(0.93, 0.95, 0.99), uSnow * up * (k == 4. ? 0.6 : 0.85));
  alb = mix(alb, vec3(0.82, 0.86, 0.92), uFrost * 0.35 * (k == 1. || k == 4. ? 1. : 0.3));
  alb *= 1. - 0.25 * uWet * (k < 2. ? 1. : 0.);
  Surf s; s.albedo = alb; s.N = N; s.rough = rough; s.spec = spec; s.ao = mix(0.75, 1., vSway); s.wrap = wrap; s.sss = sss;
  float sh = keyShadow(P, N);
  vec3 col = shadeSurf(s, P, V, sh);
  col = applyHaze(col, P);
  gl_FragColor = vec4(col, 1.);
}
`;

export class Vegetation {
  constructor(scene, data, rocks, village) {
    this.data = data;
    const rng = mulberry32(77);
    this.mat = makeMaterial({ vertex: VERT, fragment: FRAG, side: THREE.DoubleSide, uniforms: { uScaleH: { value: 1 }, uGrid: { value: 0 }, uCellSize: { value: 0 }, uCamGrid: { value: new THREE.Vector3() } } });
    this.group = new THREE.Group();
    scene.add(this.group);
    this.sets = [];
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const riverD = (x, z) => { const C = WORLD.core; return data.riverD[Math.floor((z - C.minZ) / data.cell) * data.nx + Math.floor((x - C.minX) / data.cell)]; };
    const clearOfRocks = (x, z, r) => !rocks.near(x, z).some(o => Math.hypot(o.x - x, o.z - z) < o.rb + r);

    // poplars in broken rows along both banks
    const poplars = [];
    for (let i = 0; i < RIVER.length - 1; i++) {
      const a = RIVER[i], b = RIVER[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const fx = (b[0] - a[0]) / L, fz = (b[1] - a[1]) / L;
      for (let t = 0; t < L; t += 6 + rng() * 5) {
        for (const side of [-1, 1]) {
          if (rng() < 0.3) continue;
          const off = 15 + rng() * 7;
          const x = a[0] + fx * t - fz * side * off, z = a[1] + fz * t + fx * side * off;
          if (Math.abs(z) > 1250) continue;
          if (Math.hypot(x - village.bridge.x, z - village.bridge.z) < 30) continue;
          if (!clearOfRocks(x, z, 3)) continue;
          poplars.push({ x, z, y: data.height(x, z), s: 0.85 + rng() * 0.35, r: rng() * TAU });
        }
      }
    }
    this.addSet([poplar(mulberry32(1), 0), poplar(mulberry32(2), 0), poplar(mulberry32(3), 0)], [poplar(mulberry32(1), 1), poplar(mulberry32(2), 1), poplar(mulberry32(3), 1)], poplars, 300, 1.0, true);
    this.poplars = poplars;
    // apricot orchard in rows
    const trees = [];
    const O = SITES.orchard;
    for (let x = O.x - O.r; x < O.x + O.r; x += 6.5) for (let z = O.z - O.r; z < O.z + O.r; z += 6.5) {
      if (Math.hypot(x - O.x, z - O.z) > O.r * 0.75) continue;
      const px = x + (rng() - 0.5) * 1.2, pz = z + (rng() - 0.5) * 1.2;
      if (riverD(px, pz) < 25 || !clearOfRocks(px, pz, 3)) continue;
      trees.push({ x: px, z: pz, y: data.height(px, pz), s: 0.85 + rng() * 0.3, r: rng() * TAU });
    }
    this.addSet([apricot(mulberry32(11), 0), apricot(mulberry32(12), 0)], [apricot(mulberry32(11), 1), apricot(mulberry32(12), 1)], trees, 220, 0.5, true);
    // vines on the terrace treads
    const vines = [];
    const Vn = SITES.vineyard;
    for (let x = Vn.x - Vn.r; x < Vn.x + Vn.r; x += 2.2) for (let z = Vn.z - Vn.r; z < Vn.z + Vn.r; z += 2.6) {
      const px = x + (rng() - 0.5) * 0.4, pz = z + (rng() - 0.5) * 0.4;
      if (data.attr(px, pz, 1) < 0.95) continue;
      const n = data.normal(px, pz);
      if (n.y < 0.95) continue;
      vines.push({ x: px, z: pz, y: data.height(px, pz), s: 1.2 + rng() * 0.35, r: rng() * TAU });
    }
    this.addSet([vine(mulberry32(21)), vine(mulberry32(22)), vine(mulberry32(23))], null, vines, 900, 0.3, false);
    // scrub cushions and boulders over the plateau, slopes and valley floors
    const shrubs = [], boulders = [];
    for (let i = 0; i < 26000; i++) {
      const x = -2500 + rng() * 5000, z = -1240 + rng() * 2480;
      const n = data.normal(x, z);
      const vt = data.sampleArr(data.valleyT, x, z);
      if (riverD(x, z) < 20) continue;
      const soil = data.attr(x, z, 1);
      if (soil > 0.6) continue;
      const patch = 0.5 + 0.5 * simplex2(x / 90, z / 90);
      if (n.y > 0.8 && rng() < patch * 0.55 && shrubs.length < 9000) { if (clearOfRocks(x, z, 1)) shrubs.push({ x, z, y: data.height(x, z), s: 0.5 + rng() * 0.9, r: rng() * TAU }); }
      else if (n.y > 0.55 && n.y < 0.9 && rng() < 0.25 && boulders.length < 2500) { if (clearOfRocks(x, z, 1)) boulders.push({ x, z, y: data.height(x, z), s: 0.4 + Math.pow(rng(), 3) * 2.2, r: rng() * TAU }); }
    }
    this.addSet([shrub(mulberry32(31)), shrub(mulberry32(32)), shrub(mulberry32(33))], null, shrubs, 1400, 0.3, false);
    this.addSet([boulder(mulberry32(41)), boulder(mulberry32(42)), boulder(mulberry32(43))], null, boulders, 1800, 0.0, true);
    // grass around the camera
    const gg = grassTuft();
    const ig = new THREE.InstancedBufferGeometry();
    ig.index = gg.index; ig.attributes = gg.attributes;
    this.grid = 90; this.cell = 3.0;
    ig.instanceCount = this.grid * this.grid;
    this.grassMat = makeMaterial({ vertex: VERT, fragment: FRAG, side: THREE.DoubleSide, defines: { GRASS: 1 }, shadow: false,
      uniforms: { uScaleH: { value: 1.6 }, uGrid: { value: this.grid }, uCellSize: { value: this.cell }, uCamGrid: { value: new THREE.Vector3() } } });
    this.grass = new THREE.Mesh(ig, this.grassMat);
    this.grass.frustumCulled = false;
    scene.add(this.grass);
    this._f = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._sph = new THREE.Sphere();
    this._m = m4; this._q = q;
  }

  addSet(hiGeos, loGeos, list, maxDist, swayH, cast) {
    const n = list.length;
    const set = { hi: [], lo: [], list, maxDist, loDist: loGeos ? 140 : 1e9 };
    list.forEach((o, i) => { o.v = i % hiGeos.length; });
    const mk = (geo, cnt) => {
      const mat = makeMaterial({ vertex: VERT, fragment: FRAG, side: THREE.DoubleSide, uniforms: { uScaleH: { value: swayH }, uGrid: { value: 0 }, uCellSize: { value: 0 }, uCamGrid: { value: new THREE.Vector3() } } });
      const m = new THREE.InstancedMesh(geo, mat, Math.max(1, cnt));
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0;
      m.layers.enable(2);
      if (cast) addCaster(m);
      this.group.add(m);
      return m;
    };
    for (let v = 0; v < hiGeos.length; v++) {
      const cnt = list.filter(o => o.v === v).length;
      set.hi.push(mk(hiGeos[v].geo || hiGeos[v], cnt));
      if (loGeos) set.lo.push(mk(loGeos[v].geo || loGeos[v], cnt));
    }
    this.sets.push(set);
  }

  update(camera) {
    this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._f.setFromProjectionMatrix(this._pm);
    const cp = camera.position;
    const up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const set of this.sets) {
      const ch = set.hi.map(() => 0), cl = set.lo.map(() => 0);
      for (const o of set.list) {
        this._sph.center.set(o.x, o.y + 5 * o.s, o.z); this._sph.radius = 10 * o.s;
        const d = cp.distanceTo(this._sph.center);
        if (d > set.maxDist * (G.tier === 'lite' ? 0.25 : 1) * (1 + Math.max(0, cp.y - 200) / 600)) continue;
        if (!this._f.intersectsSphere(this._sph) && d > 80) continue;
        this._q.setFromAxisAngle(up, o.r);
        this._m.compose(pos.set(o.x, o.y, o.z), this._q, sc.set(o.s, o.s, o.s));
        if (d < set.loDist || !set.lo.length) set.hi[o.v].setMatrixAt(ch[o.v]++, this._m);
        else set.lo[o.v].setMatrixAt(cl[o.v]++, this._m);
      }
      set.hi.forEach((m, i) => { m.count = ch[i]; m.instanceMatrix.needsUpdate = true; });
      set.lo.forEach((m, i) => { m.count = cl[i]; m.instanceMatrix.needsUpdate = true; });
    }
    // grass only matters when the camera is near the ground
    const ground = this.data.height(cp.x, cp.z);
    this.grass.visible = !this.noGrass && cp.y - ground < 140;
    this.grassMat.uniforms.uCamGrid.value.copy(cp);
  }
}
