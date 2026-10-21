// Fairy chimneys: lathe-built tuff bodies with erosion rills, dark basalt caps, witch-hat cones,
// multi-headed columns and cone dwellings with carved doors, windows and steps.
// Instanced per variant with two LODs; collision list for the balloon and cameras.
import * as THREE from 'three';
import { G } from '../core/shared.js';
import { mulberry32, simplex3, simplex2 } from '../core/noise.js';
import { VCOMMON, COMMON, ROCK } from '../glsl/common.js';
import { makeMaterial, addCaster } from '../core/mat.js';
import { SITES, VALLEYS } from './layout.js';

const TAU = Math.PI * 2;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- geometry ----------
function lathe(o) {
  const { NR, NY, H, sink } = o;
  const pos = [], mat = [], ao = [], idx = [];
  for (let j = 0; j <= NY; j++) {
    const u = j / NY;
    const yl = -sink + (H + sink) * o.ydist(u);
    for (let i = 0; i <= NR; i++) {
      const th = (i % NR) / NR * TAU;
      let r = o.profile(yl / H, th);
      let m = 0, a = 1;
      if (o.rn) r += o.rn(th, yl, r);
      if (o.carve) { const c = o.carve(th, yl, r); r -= c.dr; if (c.mat) m = c.mat; a *= c.ao; }
      a *= o.ao ? o.ao(yl / H, th) : 1;
      r = Math.max(0.05, r);
      pos.push(Math.cos(th) * r, yl, Math.sin(th) * r);
      mat.push(m); ao.push(a);
    }
  }
  const W = NR + 1;
  for (let j = 0; j < NY; j++) for (let i = 0; i < NR; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  if (o.closeTop) {
    const top = pos.length / 3;
    const yl = H;
    pos.push(0, yl + o.closeTop, 0); mat.push(0); ao.push(1);
    for (let i = 0; i < NR; i++) idx.push(NY * W + i, top, NY * W + i + 1);
  }
  return { pos, mat, ao, idx, W, NY };
}

function sphereBlob(o) {
  const { NA, NB, R, cy, sx, sy, seed } = o;
  const pos = [], mat = [], ao = [], idx = [];
  for (let j = 0; j <= NB; j++) {
    const v = j / NB, ph = v * Math.PI;
    for (let i = 0; i <= NA; i++) {
      const th = (i % NA) / NA * TAU;
      let x = Math.sin(ph) * Math.cos(th), y = Math.cos(ph), z = Math.sin(ph) * Math.sin(th);
      let rr = R * (1 + 0.16 * simplex3(x * 1.3 + seed, y * 1.3, z * 1.3) + 0.06 * simplex3(x * 4 + seed, y * 4, z * 4));
      // flattened underside with a slight overhang lip, domed top
      const yy = y > 0 ? y * sy : y * 0.32;
      const lip = 1 + 0.12 * Math.exp(-Math.pow((y + 0.15) / 0.25, 2));
      pos.push(x * rr * sx * lip, cy + yy * rr, z * rr * sx * lip);
      mat.push(1);
      ao.push(y < -0.2 ? 0.55 : 1);
    }
  }
  const W = NA + 1;
  for (let j = 0; j < NB; j++) for (let i = 0; i < NA; i++) {
    const a = j * W + i, b = a + 1, c = a + W, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  return { pos, mat, ao, idx, W, NY: NB };
}

function toGeometry(parts) {
  const pos = [], mat = [], ao = [], idx = [];
  const seams = [];
  for (const p of parts) {
    const base = pos.length / 3;
    for (const v of p.pos) pos.push(v);
    for (const v of p.mat) mat.push(v);
    for (const v of p.ao) ao.push(v);
    for (const v of p.idx) idx.push(v + base);
    seams.push({ base, W: p.W, NY: p.NY });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aMat', new THREE.Float32BufferAttribute(mat, 1));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld normals across lathe seams
  const n = g.attributes.normal;
  for (const s of seams) for (let j = 0; j <= s.NY; j++) {
    const a = s.base + j * s.W, b = a + s.W - 1;
    const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(x, y, z) || 1;
    n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
  }
  g.computeBoundingSphere();
  return g;
}

// vertical erosion rills plus lumpy irregularity
function rills(seed, amp, k) {
  return (th, y, r) => {
    const w = simplex2(y * 0.06 + seed, th * 1.3) * 0.9;
    const g = Math.abs(Math.sin(th * k + w + seed));
    const rill = -amp * Math.pow(1 - g, 3) * r;
    const lump = r * 0.11 * simplex3(Math.cos(th) * 1.4 + seed, y * 0.09, Math.sin(th) * 1.4);
    const fine = r * 0.03 * simplex3(Math.cos(th) * 5 + seed, y * 0.4, Math.sin(th) * 5);
    return rill + lump + fine;
  };
}

function mushroom(rng, lod) {
  const H = 14 + rng() * 20, Rb = 3.2 + rng() * 3.4, Rn = 0.9 + rng() * 0.8;
  const un = 0.86 + rng() * 0.06;
  const seed = rng() * 100;
  const NR = lod ? 20 : 64, NY = lod ? 22 : 72;
  const body = lathe({
    NR, NY, H, sink: 3,
    ydist: u => u,
    profile: (u, th) => {
      let r = u < un ? Rn + (Rb - Rn) * Math.pow(1 - u / un, 1.35) : Rn * (1 - 0.25 * smooth(un, 1, u));
      r *= 1 + 0.3 * Math.exp(-Math.max(0, u) * 14);   // talus flare
      if (u < 0) r *= 1.35;
      return r;
    },
    rn: rills(seed, 0.12, 9 + Math.floor(rng() * 5)),
    ao: (u) => (0.55 + 0.45 * smooth(-0.05, 0.12, u)) * (1 - 0.35 * smooth(un - 0.12, un, u)),
  });
  const Rc = Rn * (1.55 + rng() * 0.55);
  const cap = sphereBlob({ NA: lod ? 12 : 48, NB: lod ? 8 : 28, R: Rc, cy: H + Rc * 0.18, sx: 1, sy: 0.75 + rng() * 0.35, seed });
  return { geo: toGeometry([body, cap]), H: H + Rc * 0.9, rb: Rb, rt: Rc };
}

function cone(rng, lod) {
  const H = 10 + rng() * 22, Rb = 4 + rng() * 5;
  const seed = rng() * 100;
  const pw = 1.0 + rng() * 0.6;
  const NR = lod ? 20 : 64, NY = lod ? 20 : 64;
  const body = lathe({
    NR, NY, H, sink: 3,
    ydist: u => u,
    profile: (u) => {
      let r = Rb * Math.pow(Math.max(0, 1 - Math.max(0, u)), pw) + 0.25;
      r *= 1 + 0.5 * Math.exp(-Math.max(0, u) * 10);
      if (u < 0) r *= 1.3;
      // rounded tip
      if (u > 0.9) r *= Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.9) / 0.1, 2)) * 0.6 + 0.4);
      return r;
    },
    rn: rills(seed, 0.16, 7 + Math.floor(rng() * 6)),
    ao: (u) => 0.55 + 0.45 * smooth(-0.05, 0.12, u),
    closeTop: 0.3,
  });
  return { geo: toGeometry([body]), H, rb: Rb, rt: 0.6 };
}

function column(rng, lod) {
  // tall smooth columns of the love valley, rounded crowns
  const H = 22 + rng() * 22, Rc = 2.2 + rng() * 1.6;
  const seed = rng() * 100;
  const NR = lod ? 18 : 56, NY = lod ? 22 : 72;
  const body = lathe({
    NR, NY, H, sink: 3,
    ydist: u => u,
    profile: (u) => {
      let r = Rc * (1 + 0.9 * Math.exp(-Math.max(0, u) * 9)) * (1 - 0.15 * u);
      if (u > 0.88) { const k = (u - 0.88) / 0.12; r *= Math.sqrt(Math.max(0, 1 - k * k)) * 0.95 + 0.05; }
      if (u < 0) r *= 1.3;
      // a slightly wider, harder band near the top
      r *= 1 + 0.12 * Math.exp(-Math.pow((u - 0.82) / 0.04, 2));
      return r;
    },
    rn: rills(seed, 0.08, 11),
    ao: (u) => 0.55 + 0.45 * smooth(-0.05, 0.12, u),
    closeTop: 0.1,
  });
  return { geo: toGeometry([body]), H, rb: Rc * 1.9, rt: Rc * 0.8 };
}

function multiHead(rng, lod) {
  // shared tuff base with two or three capped heads
  const parts = [];
  const Hb = 7 + rng() * 5, Rb = 6 + rng() * 3;
  const seed = rng() * 100;
  parts.push(lathe({
    NR: lod ? 20 : 64, NY: lod ? 10 : 30, H: Hb, sink: 3, ydist: u => u,
    profile: (u) => { let r = Rb * (1 - 0.45 * Math.max(0, u)) * (1 + 0.4 * Math.exp(-Math.max(0, u) * 8)); if (u < 0) r *= 1.3; return r; },
    rn: rills(seed, 0.1, 8), ao: (u) => 0.55 + 0.45 * smooth(-0.05, 0.12, u), closeTop: 1.2,
  }));
  const heads = 2 + (rng() < 0.5 ? 1 : 0);
  for (let k = 0; k < heads; k++) {
    const a = k / heads * TAU + rng(), off = Rb * 0.35;
    const h = 8 + rng() * 9, rb = 1.8 + rng() * 1.0, rn = 0.7 + rng() * 0.4;
    const ox = Math.cos(a) * off, oz = Math.sin(a) * off;
    const body = lathe({
      NR: lod ? 14 : 44, NY: lod ? 14 : 44, H: h, sink: 0.5, ydist: u => u,
      profile: (u) => u < 0.88 ? rn + (rb - rn) * Math.pow(1 - u / 0.88, 1.2) : rn,
      rn: rills(seed + k * 7, 0.1, 7), ao: (u) => 1 - 0.35 * smooth(0.75, 0.88, u),
    });
    for (let i = 0; i < body.pos.length; i += 3) { body.pos[i] += ox; body.pos[i + 1] += Hb - 0.5; body.pos[i + 2] += oz; }
    const Rc = rn * (2.1 + rng() * 0.6);
    const cap = sphereBlob({ NA: lod ? 10 : 28, NB: lod ? 7 : 16, R: Rc, cy: 0, sx: 1, sy: 0.85, seed: seed + k });
    for (let i = 0; i < cap.pos.length; i += 3) { cap.pos[i] += ox; cap.pos[i + 1] += Hb + h - 0.5 + Rc * 0.18; cap.pos[i + 2] += oz; }
    parts.push(body, cap);
  }
  return { geo: toGeometry(parts), H: Hb + 18, rb: Rb, rt: 3 };
}

// Cone dwelling: doors with arched heads, windows, a dovecote row, steps cut in a climbing line.
function dwelling(rng, lod) {
  const H = 16 + rng() * 14, Rb = 6 + rng() * 4;
  const seed = rng() * 100;
  const pw = 1.1 + rng() * 0.3;
  const prof = (u) => {
    let r = Rb * Math.pow(Math.max(0, 1 - Math.max(0, u)), pw) + 0.4;
    r *= 1 + 0.35 * Math.exp(-Math.max(0, u) * 10);
    if (u < 0) r *= 1.3;
    if (u > 0.9) r *= Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.9) / 0.1, 2)) * 0.6 + 0.4);
    return r;
  };
  const openings = [];
  const nOpen = 4 + Math.floor(rng() * 6);
  for (let k = 0; k < nOpen; k++) {
    const y = 1.2 + rng() * H * 0.62;
    const door = k === 0 || rng() < 0.25;
    openings.push({ th: rng() * TAU, y: door && k === 0 ? 0.05 : y, w: door ? 1.0 + rng() * 0.3 : 0.45 + rng() * 0.3, h: door ? 1.9 + rng() * 0.4 : 0.55 + rng() * 0.35, d: door ? 1.4 : 0.6, door, arch: door || rng() < 0.6 });
  }
  // steps climbing to the highest doorway
  const topOpen = openings.reduce((a, b) => (b.y > a.y ? b : a));
  const steps = [];
  for (let s = 0; s < 14; s++) {
    const f = s / 14;
    steps.push({ th: topOpen.th - 0.9 * (1 - f), y: topOpen.y * f, w: 0.55, h: 0.22, d: 0.32 });
  }
  const carve = (th, y, r) => {
    let dr = 0, mat = 0, ao = 1;
    for (const o of openings) {
      let dth = th - o.th; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
      const s = dth * r, t = y - o.y;
      const hw = o.w / 2;
      let inside;
      if (o.arch) { const tr = t - (o.h - hw); inside = Math.abs(s) < hw && t > 0 && (tr < 0 || s * s + tr * tr < hw * hw); }
      else inside = Math.abs(s) < hw && t > 0 && t < o.h;
      // soft rim
      const edge = o.arch ? Math.min(hw - Math.abs(s), t, (t - (o.h - hw)) < 0 ? 9 : hw - Math.hypot(s, t - (o.h - hw))) : Math.min(hw - Math.abs(s), t, o.h - t);
      if (inside) { const k = smooth(0, 0.12, edge); dr = Math.max(dr, o.d * k); mat = o.door ? 2 : 3; ao = Math.min(ao, 0.3 + 0.5 * (1 - k)); }
      else if (edge > -0.25) ao = Math.min(ao, 0.75 + 0.25 * smooth(-0.25, 0, -edge));
    }
    for (const st of steps) {
      let dth = th - st.th; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
      const s = dth * r, t = y - st.y;
      if (Math.abs(s) < st.w / 2 && t > 0 && t < st.h) { dr = Math.max(dr, st.d); ao = Math.min(ao, 0.6); }
    }
    return { dr: lod ? 0 : dr, mat: lod ? (mat ? 2 : 0) : mat, ao };
  };
  const body = lathe({
    NR: lod ? 24 : 150, NY: lod ? 22 : 120, H, sink: 3,
    ydist: u => u,
    profile: (u) => prof(u),
    rn: (th, y, r) => rills(seed, 0.07, 9)(th, y, r) * 0.6,
    carve,
    ao: (u) => 0.55 + 0.45 * smooth(-0.05, 0.12, u),
    closeTop: 0.3,
  });
  return { geo: toGeometry([body]), H, rb: Rb, rt: 0.8 };
}

// ---------- shaders ----------
const VERT = /* glsl */`
${VCOMMON}
attribute float aMat, aAO;
varying vec3 vWorld, vN;
varying float vMat, vAO;
varying vec4 vInst, vPaint;
varying float vLocalY;
#ifdef FACADE
attribute vec4 aPaint;
#else
attribute vec4 aInst;
#endif
#ifdef DEPTH_PASS
varying float vDepthAlpha;
#endif
void main(){
#ifdef FACADE
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vInst = vec4(0.37, 0., 0., 0.); vPaint = aPaint;
  vLocalY = 10.;
#else
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vInst = aInst; vPaint = vec4(0.); vLocalY = position.y;
#endif
  vWorld = wp.xyz;
  vMat = aMat; vAO = aAO;
#ifdef DEPTH_PASS
  vDepthAlpha = 1.;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FRAG = /* glsl */`
${COMMON}
${ROCK}
varying vec3 vWorld, vN;
varying float vMat, vAO;
varying vec4 vInst, vPaint;
varying float vLocalY;
void main(){
  vec3 P = vWorld;
  if (P.y < uClipY) discard;
  vec3 V = normalize(cameraPosition - P);
  float dist = length(cameraPosition - P);
  vec3 N = normalize(vN);
  float rose = attrAt(P.xz).r;
  // triplanar-ish detail: vertical striations, pitted tuff, fine grain
  vec2 cyl = vec2(atan(N.z, N.x) * 3., P.y / 9.);
  float str = texture(uNoise2D, vec2(dot(P.xz, vec2(0.71, 0.71)) / 3.2, P.y / 38.)).r;
  vec4 nz = texture(uNoise2D, vec2(dot(P.xz, vec2(-0.6, 0.8)), P.y) / 5.);
  vec4 nz2 = texture(uNoise2D, vec2(dot(P.xz, vec2(0.8, 0.6)), P.y) / 1.3);
  float fade = 1. - smoothstep(150., 900., dist);
  vec3 T = normalize(cross(N, vec3(0, 1, 0)) + 1e-4);
  N = normalize(N + T * (str - 0.5) * 0.5 * fade);
  float cav;
  float relief = tuffRelief(P, N, length(fwidth(P)), cav);
  N = bumpNormal(N, P, relief * (vMat < 0.5 ? 1. : 0.6));
  // strata ledges catch the light
  float b = (P.y + 6. * texture(uNoise2D, P.xz / 900.).r + 2.5 * texture(uNoise2D, P.xz / 140.).g) / 9.5;
  float ledge = smoothstep(0.0, 0.06, fract(b)) * (1. - smoothstep(0.06, 0.16, fract(b)));
  N = normalize(N + vec3(0., ledge * 0.6 * fade, 0.));

  float m = vMat;
  vec3 alb;
  float rough = 0.85, spec = 0.12, ao = vAO * (1. - sat(cav) * 0.5);
  if (m < 0.5) {
    alb = tuffColor(P.y, rose, P.xz, nz.r);
    // darker weathering streaks running down from the cap
    alb *= 1. - 0.18 * smoothstep(0.55, 0.8, str) * smoothstep(0., 8., vLocalY);
    // scree and soil splash around the foot
    alb = mix(alb, vec3(0.42, 0.36, 0.28) * (0.8 + 0.4 * nz.g), smoothstep(1.6, -0.5, vLocalY) * 0.7);
  } else if (m < 1.5) {
    // basalt cap: dark, rough, with lichen and a rusty skin
    alb = mix(vec3(0.11, 0.095, 0.085), vec3(0.22, 0.19, 0.16), nz.r);
    alb = mix(alb, vec3(0.45, 0.30, 0.20), smoothstep(0.6, 0.8, nz2.g) * 0.5);
    alb = mix(alb, vec3(0.55, 0.55, 0.38), smoothstep(0.72, 0.85, nz.g) * 0.3);
    rough = 0.7; spec = 0.2;
  } else {
    // carved interiors: soot-darkened tuff
    alb = tuffColor(P.y, rose, P.xz, nz.r) * 0.32;
    ao *= 0.6;
  }
  // lime-wash and red ochre bands painted around the pigeon holes
  alb = mix(alb, vPaint.rgb * (0.85 + 0.2 * nz.r), vPaint.a);
  // snow on upward faces: cap tops, ledges, steps
  float up = smoothstep(0.45, 0.8, N.y);
  float snow = uSnow * up * smoothstep(0.3, 0.6, nz.g + uSnow * 0.5);
  alb = mix(alb, vec3(0.93, 0.95, 0.99), snow);
  rough = mix(rough, 0.45, snow); spec = mix(spec, 0.5, snow);
  // wet rock after the melt, streaking down
  float wet = uWet * (0.55 + 0.45 * smoothstep(0.4, 0.7, str)) * (1. - snow);
  alb *= 1. - 0.32 * wet; rough = mix(rough, 0.3, wet); spec = mix(spec, 0.6, wet);
  // frost
  float frost = uFrost * (1. - snow) * smoothstep(0.2, 0.7, N.y + nz.r * 0.3) * (1. - terrainShadow(P) * uKeyIsSun * smoothstep(0.1, 0.3, uKeyDir.y) * 0.8);
  alb = mix(alb, vec3(0.82, 0.86, 0.92), frost * 0.18);

  Surf s;
  s.albedo = alb; s.N = N; s.rough = rough; s.spec = spec; s.ao = ao; s.wrap = 0.15; s.sss = 0.;
  float sh = keyShadow(P, N);
  vec3 col = shadeSurf(s, P, V, sh);
  // lit windows after dusk
  if (m > 2.5) {
    float lit = step(0.55, fract(vInst.x * 7.31 + floor(vLocalY * 0.3) * 0.37)) * smoothstep(0.35, 0.8, uNight);
    float flick = 0.85 + 0.15 * sin(uTime * 7. + vInst.x * 50.) * sin(uTime * 3.1 + vInst.x * 20.);
    col += vec3(1.0, 0.52, 0.22) * lit * flick * 2.2;
  }
  col = applyHaze(col, P);
  gl_FragColor = vec4(col, 1.);
}
`;

export { VERT as ROCK_VERT, FRAG as ROCK_FRAG, lathe, toGeometry, rills, sphereBlob };

export class Rocks {
  constructor(data, facades = []) {
    this.data = data;
    this.facades = facades;
    const rng = mulberry32(7);
    this.mat = makeMaterial({ vertex: VERT, fragment: FRAG });
    // variants: [builder, count]
    // explicit names: function names don't survive minification
    const kinds = [[mushroom, 9, 'mushroom'], [cone, 6, 'cone'], [column, 4, 'column'], [multiHead, 3, 'multiHead'], [dwelling, 5, 'dwelling']];
    this.variants = [];
    for (const [fn, n, name] of kinds) for (let k = 0; k < n; k++) {
      const seed = Math.floor(rng() * 1e9);
      const hi = fn(mulberry32(seed), 0), lo = fn(mulberry32(seed), 1);
      this.variants.push({ kind: name, hi, lo, list: [] });
    }
    this.place(rng);
    this.group = new THREE.Group();
    for (const v of this.variants) {
      const n = Math.max(1, v.list.length);
      for (const lod of ['hi', 'lo']) {
        const geo = v[lod].geo;
        const inst = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
        inst.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aInst', inst);
        const mesh = new THREE.InstancedMesh(geo, this.mat, n);
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        mesh.count = 0;
        mesh.layers.enable(2);
        addCaster(mesh);
        this.group.add(mesh);
        v[lod + 'Mesh'] = mesh; v[lod + 'Inst'] = inst;
      }
    }
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3();
    this._f = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._sph = new THREE.Sphere();
    this.buildGrid();
  }

  place(rng) {
    const d = this.data;
    const byKind = k => this.variants.filter(v => v.kind === k);
    const pick = (arr) => arr[Math.floor(rng() * arr.length)];
    const excl = [
      [SITES.launch.x, SITES.launch.z, SITES.launch.r + 30], [SITES.landing.x, SITES.landing.z, SITES.landing.r + 30],
      [SITES.castle.x, SITES.castle.z, 380], [SITES.vineyard.x, SITES.vineyard.z, SITES.vineyard.r],
      [SITES.orchard.x, SITES.orchard.z, SITES.orchard.r + 20], [SITES.horses.x, SITES.horses.z, 170],
      [SITES.church.x, SITES.church.z, 45], [SITES.dovecote.x, SITES.dovecote.z, 30],
      ...this.facades.map(f => [f.x + f.nx * 8, f.z + f.nz * 8, f.W / 2 + 16]),
    ];
    this.instances = [];
    const cell = 15;
    for (let z = -1260; z < 1260; z += cell) for (let x = -2540; x < 2540; x += cell) {
      const px = x + rng() * cell, pz = z + rng() * cell;
      const vid = d.sampleArr(d.valleyId, px, pz);
      if (vid === 255 || vid === undefined) continue;
      const V = VALLEYS[vid];
      if (!V || !V.chimneys) continue;
      const t = d.sampleArr(d.valleyT, px, pz);
      if (t > 0.55) continue;
      if (d.riverD[Math.floor((pz + 1280) / d.cell) * d.nx + Math.floor((px + 2560) / d.cell)] < 40) continue;
      let bad = false;
      for (const e of excl) if (Math.hypot(px - e[0], pz - e[1]) < e[2]) { bad = true; break; }
      if (bad) continue;
      const cluster = smooth(0.25, 0.65, 0.5 + 0.5 * simplex2(px / 160, pz / 160));
      const nearCave = Math.hypot(px - SITES.caves.x, pz - SITES.caves.z) < 170;
      let p = V.chimneys * cluster * (t < 0.25 ? 0.5 : 0.28);
      if (nearCave) p = Math.max(p, 0.35);
      if (rng() > p) continue;
      const nrm = d.normal(px, pz);
      if (nrm.y < 0.55) continue;
      let kinds;
      if (nearCave) kinds = rng() < 0.6 ? 'dwelling' : 'cone';
      else if (V.id === 'love') kinds = rng() < 0.65 ? 'column' : 'mushroom';
      else if (V.id === 'rose') kinds = rng() < 0.7 ? 'cone' : 'dwelling';
      else kinds = rng() < 0.55 ? 'mushroom' : rng() < 0.6 ? 'cone' : rng() < 0.5 ? 'multiHead' : 'dwelling';
      const v = pick(byKind(kinds));
      const s = (0.75 + rng() * 0.5) * (t < 0.2 ? 1 : 0.8);
      const sy = s * (0.85 + rng() * 0.3);
      const rb = v.hi.rb * s;
      // keep a clear gap from neighbours
      let clash = false;
      for (let k = this.instances.length - 1; k >= 0 && k > this.instances.length - 400; k--) {
        const o = this.instances[k];
        if (Math.hypot(o.x - px, o.z - pz) < (o.rb + rb) * 0.75) { clash = true; break; }
      }
      if (clash) continue;
      // sit on the lowest ground under the footprint, sunk in
      let gy = 1e9;
      for (let a = 0; a < 6; a++) gy = Math.min(gy, d.height(px + Math.cos(a) * rb * 0.6, pz + Math.sin(a) * rb * 0.6));
      gy = Math.min(gy, d.height(px, pz));
      const inst = { x: px, z: pz, y: gy - 0.4, s, sy, rot: rng() * TAU, v, seed: rng(), rb, rt: v.hi.rt * s, h: v.hi.H * sy };
      this.instances.push(inst);
      v.list.push(inst);
    }
  }

  addCollider(c) {
    const o = { x: c.x, z: c.z, y: c.y, h: c.h, rb: c.r + 6, rt: c.r * 0.35, s: 1, sy: 1, v: null };
    this.instances.push(o);
    this.buildGrid();
  }
  buildGrid() {
    // spatial hash for collision queries
    this.grid = new Map();
    const C = 40;
    for (const o of this.instances) {
      const r = o.rb + 2;
      for (let gx = Math.floor((o.x - r) / C); gx <= Math.floor((o.x + r) / C); gx++)
        for (let gz = Math.floor((o.z - r) / C); gz <= Math.floor((o.z + r) / C); gz++) {
          const k = gx * 100000 + gz;
          if (!this.grid.has(k)) this.grid.set(k, []);
          this.grid.get(k).push(o);
        }
    }
    this.C = C;
  }
  near(x, z) {
    return this.grid.get(Math.floor(x / this.C) * 100000 + Math.floor(z / this.C)) || [];
  }
  // radius of rock at height y for collision (cone approximation + cap)
  radiusAt(o, y) {
    const u = (y - o.y) / o.h;
    if (u < 0) return o.rb;
    if (u > 1.05) return -1;
    return o.rb + (o.rt - o.rb) * Math.min(1, u);
  }

  update(camera) {
    this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._f.setFromProjectionMatrix(this._pm);
    const cp = camera.position;
    for (const v of this.variants) {
      let nh = 0, nl = 0;
      const mh = v.hiMesh.instanceMatrix.array, ml = v.loMesh.instanceMatrix.array;
      const ih = v.hiInst.array, il = v.loInst.array;
      for (const o of v.list) {
        this._sph.center.set(o.x, o.y + o.h * 0.5, o.z); this._sph.radius = Math.max(o.h, o.rb * 2);
        const dist = cp.distanceTo(this._sph.center);
        if (dist > (G.tier === 'lite' ? 1400 : 5200)) continue;
        // keep shadow casters just outside the view
        if (!this._f.intersectsSphere(this._sph) && dist > 220) continue;
        this._q.setFromAxisAngle(this._p.set(0, 1, 0), o.rot);
        this._m.compose(this._p.set(o.x, o.y, o.z), this._q, this._s.set(o.s, o.sy, o.s));
        if (dist < (G.tier === 'lite' ? 60 : 230)) { this._m.toArray(mh, nh * 16); ih[nh * 4] = o.seed; nh++; }
        else { this._m.toArray(ml, nl * 16); il[nl * 4] = o.seed; nl++; }
      }
      v.hiMesh.count = nh; v.loMesh.count = nl;
      v.hiMesh.instanceMatrix.needsUpdate = true; v.loMesh.instanceMatrix.needsUpdate = true;
      v.hiInst.needsUpdate = true; v.loInst.needsUpdate = true;
    }
  }
}
