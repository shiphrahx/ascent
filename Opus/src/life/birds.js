// Pigeon flocks that burst from the dovecote cliffs and wheel around them, and a pair of
// eagles circling on a thermal near the hero balloon. Wings flap in the vertex shader.
import * as THREE from 'three';
import { VCOMMON, COMMON } from '../glsl/common.js';
import { makeMaterial, addCaster } from '../core/mat.js';
import { mulberry32 } from '../core/noise.js';

function birdGeo() {
  // body along +z, wings along x; aWing: -1/0/1, aSpan 0..1
  const pos = [], wing = [], span = [], col = [], idx = [];
  const add = (p, w, s, c) => { pos.push(...p); wing.push(w); span.push(s); col.push(c); return pos.length / 3 - 1; };
  // body: a little spindle
  const ring = [];
  const zs = [-0.55, -0.35, 0, 0.3, 0.48, 0.58];
  const rs = [0.02, 0.09, 0.13, 0.11, 0.07, 0.03];
  for (let j = 0; j < zs.length; j++) {
    const r = [];
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; r.push(add([Math.cos(a) * rs[j], Math.sin(a) * rs[j] * 0.85 + (j === 4 ? 0.04 : 0), zs[j]], 0, 0, 0)); }
    ring.push(r);
  }
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < 8; i++) { const a = ring[j][i], b = ring[j][(i + 1) % 8], c = ring[j + 1][i], d = ring[j + 1][(i + 1) % 8]; idx.push(a, c, b, b, c, d); }
  // tail fan
  const t0 = add([-0.12, 0, -0.45], 0, 0, 1), t1 = add([0.12, 0, -0.45], 0, 0, 1), t2 = add([0.2, 0, -0.85], 0, 0.2, 1), t3 = add([-0.2, 0, -0.85], 0, 0.2, 1);
  idx.push(t0, t1, t2, t0, t2, t3);
  // wings: two panels each, swept back at the tips
  for (const s of [-1, 1]) {
    const r0 = add([s * 0.08, 0.03, 0.18], s, 0, 1), r1 = add([s * 0.08, 0.03, -0.18], s, 0, 1);
    const m0 = add([s * 0.55, 0.05, 0.15], s, 0.5, 1), m1 = add([s * 0.55, 0.05, -0.25], s, 0.5, 1);
    const tp0 = add([s * 1.0, 0.04, -0.05], s, 1, 2), tp1 = add([s * 0.95, 0.04, -0.35], s, 1, 2);
    if (s > 0) idx.push(r0, m0, r1, r1, m0, m1, m0, tp0, m1, m1, tp0, tp1);
    else idx.push(r0, r1, m0, r1, m1, m0, m0, m1, tp0, m1, tp1, tp0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(wing, 1));
  g.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(col, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const VERT = /* glsl */`
${VCOMMON}
attribute float aWing, aSpan, aPart;
attribute vec4 aBird;   // phase, flap rate, flap amplitude, kind
varying vec3 vWorld, vN;
varying float vPart, vKind;
#ifdef DEPTH_PASS
varying float vDepthAlpha;
#endif
void main(){
  vec3 p = position;
  float ang = sin(uTime * aBird.y + aBird.x) * aBird.z + 0.12 * (aBird.w > 0.5 ? 1.6 : 1.);
  // fold and flap about the shoulder, more toward the tip
  if (aWing != 0.) {
    float a = ang * (0.6 + 0.6 * aSpan);
    float cs = cos(a), sn = sin(a);
    float x = abs(p.x);
    p.y += x * sn;
    p.x = sign(p.x) * x * cs;
  }
  vec4 wp = modelMatrix * instanceMatrix * vec4(p, 1.);
  vWorld = wp.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vPart = aPart; vKind = aBird.w;
#ifdef DEPTH_PASS
  vDepthAlpha = 1.;
#endif
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRAG = /* glsl */`
${COMMON}
varying vec3 vWorld, vN;
varying float vPart, vKind;
void main(){
  vec3 P = vWorld;
  if (P.y < uClipY) discard;
  vec3 V = normalize(cameraPosition - P);
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 alb;
  if (vKind < 0.5) alb = vPart < 0.5 ? vec3(0.42, 0.44, 0.50) : (vPart < 1.5 ? vec3(0.55, 0.57, 0.62) : vec3(0.18, 0.18, 0.2));
  else alb = vPart < 0.5 ? vec3(0.28, 0.18, 0.10) : (vPart < 1.5 ? vec3(0.32, 0.21, 0.12) : vec3(0.12, 0.09, 0.07));
  Surf s; s.albedo = alb; s.N = N; s.rough = 0.8; s.spec = 0.1; s.ao = 1.; s.wrap = 0.4; s.sss = 0.3;
  vec3 col = shadeSurf(s, P, V, keyShadow(P, N));
  col = applyHaze(col, P);
  gl_FragColor = vec4(col, litAlpha(col));
}
`;

export class Birds {
  constructor(scene, data, facades, hero) {
    this.data = data; this.hero = hero;
    const rng = mulberry32(808);
    this.rng = rng;
    const geo = birdGeo();
    const N = 3 * 36 + 2;
    this.attr = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
    geo.setAttribute('aBird', this.attr);
    this.mesh = new THREE.InstancedMesh(geo, makeMaterial({ vertex: VERT, fragment: FRAG, side: THREE.DoubleSide }), N);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.layers.enable(2);
    addCaster(this.mesh);
    scene.add(this.mesh);
    // flocks anchored at the dovecotes and the church cliff
    const homes = facades.map(f => ({ x: f.x + f.nx * 2, y: f.floorY + f.H * 0.45, z: f.z + f.nz * 2, nx: f.nx, nz: f.nz, tx: f.tx, tz: f.tz }));
    this.flocks = [1, 2, 0].map((k, i) => ({
      home: homes[k], state: 'rest', t: rng() * 20 + i * 12, dur: 20, c: new THREE.Vector3(), ang: rng() * 6.28, r: 70, alt: 40, speed: 13,
      birds: Array.from({ length: 36 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), off: new THREE.Vector3((rng() - 0.5) * 16, (rng() - 0.5) * 6, (rng() - 0.5) * 16), ph: rng() * 6.28, rest: new THREE.Vector3() })),
    }));
    for (const F of this.flocks) {
      const h = F.home;
      F.birds.forEach((b, i) => {
        // resting on the cliff top above the dovecote, spread along the edge
        const a = (i / 36 - 0.5) * 30;
        const x = h.x + h.tx * a - h.nx * (12 + rng() * 6), z = h.z + h.tz * a - h.nz * (12 + rng() * 6);
        b.rest.set(x, this.data.height(x, z) + 0.12, z);
        b.p.copy(b.rest);
      });
    }
    this.eagles = [0, 1].map(i => ({ p: new THREE.Vector3(), ang: i * 3.1, r: 55 + i * 22, w: 0, flap: 0, flapT: rng() * 10, dalt: i * 14 - 6, c: new THREE.Vector3() }));
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(1, 1, 1);
    this._look = new THREE.Matrix4(); this._up = new THREE.Vector3(0, 1, 0);
  }

  update(dt, t) {
    const hero = this.hero;
    const hp = hero.flight.p;
    let k = 0;
    for (const F of this.flocks) {
      F.t += dt;
      const h = F.home;
      const near = Math.hypot(hp.x - h.x, hp.z - h.z) < 220;
      if (F.state === 'rest' && (F.t > F.dur || (near && F.t > 6))) { F.state = 'fly'; F.t = 0; F.dur = 35 + this.rng() * 30; F.ang = Math.atan2(h.nz, h.nx); F.c.set(h.x + h.nx * 60, 0, h.z + h.nz * 60); }
      else if (F.state === 'fly' && F.t > F.dur) { F.state = 'return'; F.t = 0; }
      else if (F.state === 'return' && F.t > 14) { F.state = 'rest'; F.t = 0; F.dur = 25 + this.rng() * 40; }
      // flock centre wheels around the cliff
      F.ang += dt * F.speed / F.r * (F.state === 'fly' ? 1 : 0.7);
      const ground = this.data.height(F.c.x, F.c.z);
      const lead = new THREE.Vector3(F.c.x + Math.cos(F.ang) * F.r, Math.max(ground, h.y) + F.alt + 12 * Math.sin(F.t * 0.4), F.c.z + Math.sin(F.ang) * F.r * 0.7);
      for (const b of F.birds) {
        let target;
        if (F.state === 'rest') target = b.rest;
        else if (F.state === 'return') target = F.t > 8 ? b.rest : lead.clone().add(b.off).lerp(b.rest, F.t / 8);
        else target = lead.clone().add(b.off.clone().applyAxisAngle(this._up, F.ang));
        const dv = target.clone().sub(b.p);
        const dist = dv.length();
        if (F.state === 'rest' && dist < 0.5) { b.p.copy(b.rest); b.v.set(0, 0, 0); }
        else {
          const want = dv.normalize().multiplyScalar(Math.min(F.speed * 1.2, dist * 1.5));
          b.v.lerp(want, Math.min(1, dt * 2.2));
          b.v.x += Math.sin(t * 2 + b.ph) * 0.6 * dt; b.v.y += Math.cos(t * 1.7 + b.ph) * 0.4 * dt;
          b.p.addScaledVector(b.v, dt);
        }
        const flying = b.v.lengthSq() > 0.5;
        this.orient(b.p, flying ? b.v : new THREE.Vector3(Math.cos(b.ph), 0, Math.sin(b.ph)), flying ? 0.38 : 0.38, b.v);
        this.mesh.setMatrixAt(k, this._m);
        // resting birds fold their wings; flying ones beat fast
        this.attr.setXYZW(k, b.ph, 17 + (b.ph % 3), flying ? 0.75 : 0.0, 0);
        k++;
      }
    }
    // eagles: slow circles on a thermal beside the balloon, rising and drifting
    for (const E of this.eagles) {
      const side = new THREE.Vector3(-hero.flight.v.z, 0, hero.flight.v.x).normalize();
      const centre = hp.clone().addScaledVector(side, 90).add(new THREE.Vector3(0, 8 + E.dalt, 0));
      E.c.lerp(centre, Math.min(1, dt * 0.08));
      if (E.c.lengthSq() === 0) E.c.copy(centre);
      E.ang += dt * 10 / E.r;
      const g = this.data.height(E.c.x, E.c.z);
      E.p.set(E.c.x + Math.cos(E.ang) * E.r, Math.max(E.c.y, g + 40) + 3 * Math.sin(t * 0.2 + E.r), E.c.z + Math.sin(E.ang) * E.r);
      E.flapT -= dt;
      if (E.flapT < 0) { E.flap = 2.2; E.flapT = 8 + this.rng() * 10; }
      E.flap = Math.max(0, E.flap - dt);
      const vel = new THREE.Vector3(-Math.sin(E.ang), 0, Math.cos(E.ang));
      this.orient(E.p, vel, 1.1, vel, 0.35);
      this.mesh.setMatrixAt(k, this._m);
      this.attr.setXYZW(k, E.r, 4.5, E.flap > 0 ? 0.55 : 0.0, 1);
      k++;
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.attr.needsUpdate = true;
  }
  orient(p, dir, scale, vel, bank = 0) {
    const f = dir.clone().normalize();
    if (!(f.lengthSq() > 0.5)) f.set(1, 0, 0);
    const x = new THREE.Vector3().crossVectors(this._up, f).normalize();
    const y = new THREE.Vector3().crossVectors(f, x).normalize();
    if (bank) { x.applyAxisAngle(f, bank); y.applyAxisAngle(f, bank); }
    this._look.makeBasis(x, y, f);
    this._q.setFromRotationMatrix(this._look);
    this._m.compose(p, this._q, this._s.set(scale, scale, scale));
  }
}
