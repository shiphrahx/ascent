// A small herd of wild horses: graze, wander, and bolt away when the balloon comes over low
// or a burner roars close by. Rigid-part skinned, legs animated by gait phase.
import * as THREE from 'three';
import { propMaterial, tag, merge } from '../balloon/props.js';
import { addCaster } from '../core/mat.js';
import { mulberry32 } from '../core/noise.js';
import { SITES } from '../world/layout.js';
import { WORLD } from '../core/shared.js';

const BN = { BODY: 0, NECK: 1, HEAD: 2, TAIL: 3, FLU: 4, FLL: 5, FRU: 6, FRL: 7, BLU: 8, BLL: 9, BRU: 10, BRL: 11 };
const ell = (rx, ry, rz, x = 0, y = 0, z = 0, seg = 14) => { const g = new THREE.SphereGeometry(1, seg, 10); g.scale(rx, ry, rz); g.translate(x, y, z); return g; };
const taper = (r0, r1, len, dir = 1, seg = 10) => { const g = new THREE.CylinderGeometry(dir > 0 ? r1 : r0, dir > 0 ? r0 : r1, len, seg, 2); g.translate(0, dir * len / 2, 0); return g; };

function horseGeo(coat, dark) {
  const P = [];
  const add = (g, m, c, b) => P.push(tag(g, m, c, null, b));
  // body: barrel, chest, rump, belly
  add(ell(0.27, 0.33, 0.72, 0, 0, 0), 10, coat, BN.BODY);
  add(ell(0.26, 0.34, 0.3, 0, 0.04, 0.5), 10, coat, BN.BODY);
  add(ell(0.28, 0.32, 0.32, 0, 0.05, -0.5), 10, coat, BN.BODY);
  add(ell(0.23, 0.2, 0.55, 0, -0.14, 0), 10, coat, BN.BODY);
  // neck along +y, mane down the crest
  add(taper(0.17, 0.1, 0.78, 1), 10, coat, BN.NECK);
  const mane = new THREE.BoxGeometry(0.05, 0.8, 0.16); mane.translate(0, 0.38, -0.1); add(mane, 11, dark, BN.NECK);
  // head along +y from the poll, muzzle at the far end
  add(ell(0.1, 0.27, 0.13, 0, 0.22, 0.02), 10, coat, BN.HEAD);
  add(ell(0.085, 0.1, 0.1, 0, 0.45, 0.02), 10, coat.map(c => c * 0.8), BN.HEAD);
  for (const s of [-1, 1]) {
    const ear = new THREE.ConeGeometry(0.035, 0.12, 6); ear.rotateX(-0.3); ear.translate(s * 0.06, 0.0, -0.1); add(ear, 10, coat, BN.HEAD);
    const eye = ell(0.02, 0.025, 0.02, s * 0.095, 0.16, 0.05, 8); add(eye, 13, [0.02, 0.02, 0.02], BN.HEAD);
  }
  const forelock = new THREE.BoxGeometry(0.1, 0.12, 0.04); forelock.translate(0, 0.04, 0.1); add(forelock, 11, dark, BN.HEAD);
  // tail
  add(taper(0.06, 0.1, 0.75, -1, 8), 11, dark, BN.TAIL);
  // legs: upper and lower with hooves
  for (const [u, l] of [[BN.FLU, BN.FLL], [BN.FRU, BN.FRL], [BN.BLU, BN.BLL], [BN.BRU, BN.BRL]]) {
    add(taper(0.1, 0.065, 0.5, -1), 10, coat, u);
    add(taper(0.05, 0.04, 0.5, -1), 10, dark.map((c, i) => c * 0.5 + coat[i] * 0.5), l);
    const hoof = new THREE.CylinderGeometry(0.05, 0.06, 0.08, 10); hoof.translate(0, -0.52, 0.01); add(hoof, 12, [0.06, 0.05, 0.04], l);
  }
  return merge(P);
}

const COATS = [
  [[0.36, 0.18, 0.08], [0.05, 0.04, 0.03]], [[0.5, 0.26, 0.11], [0.35, 0.16, 0.07]], [[0.55, 0.54, 0.52], [0.25, 0.24, 0.23]],
  [[0.07, 0.06, 0.06], [0.03, 0.03, 0.03]], [[0.6, 0.45, 0.28], [0.12, 0.09, 0.06]], [[0.36, 0.18, 0.08], [0.05, 0.04, 0.03]], [[0.72, 0.68, 0.62], [0.5, 0.48, 0.45]],
];

export class Horses {
  constructor(scene, data, rocks) {
    this.data = data; this.rocks = rocks;
    const rng = mulberry32(42);
    this.rng = rng;
    this.home = new THREE.Vector2(SITES.horses.x, SITES.horses.z);
    this.list = COATS.map(([coat, dark], i) => {
      const mat = propMaterial(true);
      const mesh = new THREE.Mesh(horseGeo(coat, dark), mat);
      mesh.frustumCulled = false; mesh.layers.enable(2);
      addCaster(mesh);
      scene.add(mesh);
      const a = rng() * Math.PI * 2, r = rng() * 30;
      return {
        mesh, mat, p: new THREE.Vector2(this.home.x + Math.cos(a) * r, this.home.y + Math.sin(a) * r), head: rng() * Math.PI * 2,
        speed: 0, target: 0, state: 'graze', t: rng() * 8, dur: 5 + rng() * 8, phase: rng() * 10, neck: 2.0, headA: 1.0, tail: 0, s: 0.95 + rng() * 0.12,
        noseWorld: new THREE.Vector3(), puffT: rng() * 3,
      };
    });
    this.alarm = 0; this.flee = new THREE.Vector2();
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3();
  }

  riverD(x, z) { const C = WORLD.core, d = this.data; return d.riverD[Math.floor((z - C.minZ) / d.cell) * d.nx + Math.floor((x - C.minX) / d.cell)]; }

  update(dt, t, hero, parts) {
    const hp = hero.flight.p;
    // a low pass or a close burner blast spooks the herd
    const dh = Math.hypot(hp.x - this.home.x, hp.z - this.home.y);
    const agl = hp.y - this.data.height(hp.x, hp.z);
    if (dh < 170 && agl < 75 && (this.alarm <= 0 || hero.flameI > 0.5)) { this.alarm = 9 + this.rng() * 4; this.flee.set(this.home.x - hp.x, this.home.y - hp.z).normalize(); }
    this.alarm -= dt;
    for (const H of this.list) {
      H.t += dt;
      if (this.alarm > 0) { H.state = 'run'; }
      else if (H.state === 'run') { H.state = 'walk'; H.t = 0; H.dur = 4; }
      else if (H.t > H.dur) {
        H.t = 0; H.dur = 4 + this.rng() * 9;
        H.state = this.rng() < 0.6 ? 'graze' : 'walk';
        H.target = H.head + (this.rng() - 0.5) * 2;
      }
      let spd = 0;
      if (H.state === 'run') {
        spd = 8.5 + (H.phase % 1.5);
        const fa = Math.atan2(this.flee.y, this.flee.x) + Math.sin(H.phase) * 0.3;
        H.target = fa;
      } else if (H.state === 'walk') spd = 1.3;
      else spd = this.rng() < 0.002 ? 0.6 : 0;
      // stay on the meadow: turn back toward home, away from the river
      const toHome = this._v.set(this.home.x - H.p.x, 0, this.home.y - H.p.y);
      if (toHome.length() > 150) H.target = Math.atan2(toHome.z, toHome.x);
      if (this.riverD(H.p.x, H.p.y) < 30) { const a = H.head + Math.PI * 0.5; H.target = a; }
      // separation
      for (const O of this.list) if (O !== H) { const dx = H.p.x - O.p.x, dz = H.p.y - O.p.y, d = Math.hypot(dx, dz); if (d < 2.6 && d > 0.01) { H.p.x += dx / d * (2.6 - d) * dt * 2; H.p.y += dz / d * (2.6 - d) * dt * 2; } }
      let dA = H.target - H.head; dA = Math.atan2(Math.sin(dA), Math.cos(dA));
      H.head += dA * Math.min(1, dt * (H.state === 'run' ? 2.5 : 0.8));
      H.speed += (spd - H.speed) * Math.min(1, dt * 2.5);
      H.p.x += Math.cos(H.head) * H.speed * dt; H.p.y += Math.sin(H.head) * H.speed * dt;
      this.pose(H, dt, t);
      // breath from the nostrils
      H.puffT -= dt;
      if (parts && H.puffT < 0) { H.puffT = H.state === 'run' ? 0.45 : 2.2 + this.rng(); parts.puff(H.noseWorld, new THREE.Vector3(Math.cos(H.head), -0.1, Math.sin(H.head)).multiplyScalar(0.5), 1.6); }
    }
  }

  pose(H, dt, t) {
    const M = H.mat.uniforms.uBones.value;
    const y = this.data.height(H.p.x, H.p.y);
    const n = this.data.normal(H.p.x, H.p.y);
    const run = H.state === 'run' ? 1 : 0;
    const gaitF = H.speed > 0.2 ? (run ? 2.6 : 1.4) : 0;
    H.phase += dt * gaitF * Math.PI * 2 * (run ? 1.0 : 0.6);
    const ph = H.phase;
    // neck: low when grazing, high and forward when running
    const neckT = H.state === 'graze' && H.speed < 0.3 ? 2.15 + 0.08 * Math.sin(t * 0.7 + H.phase) : run ? 0.95 : 0.7;
    H.neck += (neckT - H.neck) * Math.min(1, dt * 2);
    const headT = H.state === 'graze' ? 0.55 + 0.1 * Math.sin(t * 2.3 + H.phase) : 1.35;
    H.headA += (headT - H.headA) * Math.min(1, dt * 2);
    H.tail = 0.25 * Math.sin(t * 1.3 + H.phase * 0.3) + run * 0.5;
    const s = H.s;
    const root = new THREE.Matrix4().compose(new THREE.Vector3(H.p.x, y, H.p.y),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -H.head + Math.PI / 2).premultiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().lerp(new THREE.Vector3(0, 1, 0), 0.5).normalize())),
      new THREE.Vector3(s, s, s));
    const bob = run ? Math.abs(Math.sin(ph)) * 0.08 : (H.speed > 0.2 ? Math.abs(Math.sin(ph)) * 0.02 : 0);
    const L = (pos, rx, rz = 0) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, rz)), new THREE.Vector3(1, 1, 1));
    const body = L(new THREE.Vector3(0, 1.22 + bob, 0), run ? Math.sin(ph * 2) * 0.05 : 0);
    M[BN.BODY].multiplyMatrices(root, body);
    const neck = new THREE.Matrix4().multiplyMatrices(body, L(new THREE.Vector3(0, 0.18, 0.62), H.neck));
    M[BN.NECK].multiplyMatrices(root, neck);
    const head = new THREE.Matrix4().multiplyMatrices(neck, L(new THREE.Vector3(0, 0.78, 0), H.headA));
    M[BN.HEAD].multiplyMatrices(root, head);
    H.noseWorld.set(0, 0.5, 0.06).applyMatrix4(M[BN.HEAD]);
    M[BN.TAIL].multiplyMatrices(root, new THREE.Matrix4().multiplyMatrices(body, L(new THREE.Vector3(0, 0.15, -0.8), 0.35 + H.tail * 0.5, Math.sin(t * 1.1 + H.phase) * 0.2)));
    // legs: walk is a four-beat, the gallop gathers the pairs
    const offs = run ? [0, 0.12, 0.55, 0.67] : [0, 0.5, 0.75, 0.25];
    const legs = [[BN.FLU, BN.FLL, 0.16, 0.48], [BN.FRU, BN.FRL, -0.16, 0.48], [BN.BLU, BN.BLL, 0.17, -0.52], [BN.BRU, BN.BRL, -0.17, -0.52]];
    const moving = Math.min(1, H.speed / 1.0);
    legs.forEach(([u, l, x, z], i) => {
      const a = ph + offs[i] * Math.PI * 2;
      const amp = (run ? 0.6 : 0.32) * moving;
      const hip = Math.sin(a) * amp;
      const knee = Math.max(0, Math.cos(a)) * (run ? 1.1 : 0.6) * moving * (z > 0 ? 1 : -0.7);
      const up = new THREE.Matrix4().multiplyMatrices(body, L(new THREE.Vector3(x, -0.12, z), hip));
      M[u].multiplyMatrices(root, up);
      const low = new THREE.Matrix4().multiplyMatrices(up, L(new THREE.Vector3(0, -0.5, 0), knee));
      M[l].multiplyMatrices(root, low);
    });
  }
}
