// The other balloons: ~34 in the air on their own wind layers, plus a launch field where
// envelopes lie on their sides being hot-inflated, stand up, and lift off to join the sky.
// Instanced envelopes in three LODs, instanced baskets and flames.
import * as THREE from 'three';
import { G } from '../core/shared.js';
import { buildEnvelope, buildSkirt, envelopeMaterial, PALETTES } from './envelope.js';
import { propMaterial, tag, merge, cyl } from './props.js';
import { addCaster } from '../core/mat.js';
import { FLAME_GEO, flameMaterial } from '../fx/flame.js';
import { mulberry32 } from '../core/noise.js';
import { SITES } from '../world/layout.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const FLYERS = 34, LAUNCH = 4;
const T_EQ = 52, B_RATE = 5.2, COOL = 0.021, LIFT_K = 0.034, DRAG_K = 0.045;

function envWithSkirt(lod) {
  const e = buildEnvelope(lod), s = buildSkirt(lod ? 1 : 0);
  const g = mergeGeometries([e, s]);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 10, 0), 15);
  return g;
}

function fleetBasket() {
  const parts = [];
  const L = 2.6, W = 1.7, H = 1.15;
  const box = new THREE.BoxGeometry(L, H, W, 1, 1, 1); box.translate(0, H / 2, 0);
  parts.push(tag(box, 0, [1, 1, 1], (x, y, z) => [x + z * 1.3, y]));
  const rim = new THREE.BoxGeometry(L + 0.08, 0.1, W + 0.08); rim.translate(0, H, 0);
  parts.push(tag(rim, 1));
  // uprights and frame
  for (const [x, z] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const u = new THREE.CylinderGeometry(0.05, 0.05, 1.35, 6); u.translate(x * 0.75, H + 0.65, z * 0.45);
    parts.push(tag(u, 8, [0.08, 0.08, 0.1]));
  }
  const fr = new THREE.BoxGeometry(1.6, 0.06, 1.0); fr.translate(0, H + 1.35, 0);
  parts.push(tag(fr, 2));
  parts.push(tag(cyl(0.18, 0.2, 0.5, 10, 0, H + 1.38, 0), 2));
  // a few passengers: heads and shoulders peeking over the rim
  const cols = [[0.5, 0.1, 0.1], [0.1, 0.2, 0.4], [0.15, 0.3, 0.15], [0.4, 0.3, 0.1], [0.2, 0.2, 0.22], [0.45, 0.4, 0.35]];
  let k = 0;
  for (const x of [-0.85, -0.35, 0.35, 0.85]) for (const z of [-0.4, 0.4]) {
    if ((k * 7) % 3 === 0) { k++; continue; }
    const body = new THREE.CylinderGeometry(0.2, 0.22, 0.7, 8); body.translate(x, H + 0.1, z);
    parts.push(tag(body, 9, cols[k % cols.length]));
    const head = new THREE.SphereGeometry(0.12, 8, 6); head.translate(x, H + 0.6, z);
    parts.push(tag(head, 10, [0.62, 0.42, 0.32]));
    const hat = new THREE.SphereGeometry(0.125, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2); hat.translate(x, H + 0.63, z);
    parts.push(tag(hat, 14, cols[(k + 3) % cols.length]));
    k++;
  }
  // flying wires to the mouth (mouth is 5 m above the floor)
  for (const [x, z] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    const a = new THREE.Vector3(x * 0.75, H + 1.38, z * 0.45), b = new THREE.Vector3(x * 1.55, 5.0, z * 1.55);
    const d = b.clone().sub(a);
    const c = new THREE.CylinderGeometry(0.012, 0.012, d.length(), 4, 1, true);
    c.translate(0, d.length() / 2, 0);
    c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
    c.translate(a.x, a.y, a.z);
    parts.push(tag(c, 2));
  }
  const g = merge(parts);
  g.translate(0, -5.0, 0); // mouth-local
  return g;
}

export class Fleet {
  constructor(scene, data, rocks, wind) {
    this.data = data; this.rocks = rocks; this.wind = wind;
    const rng = mulberry32(99);
    this.rng = rng;
    this.items = [];
    const N = FLYERS + LAUNCH;
    for (let i = 0; i < N; i++) {
      const it = {
        p: new THREE.Vector3(), v: new THREE.Vector3(), x: 0, s: 0.95 + rng() * 0.5,
        pal: 1 + (i % (PALETTES.length - 1)), pat: 1 + Math.floor(rng() * 7), seed: rng(),
        burn: 0, flame: 0, hold: 0, cool: rng() * 10, target: 100, retarget: 0, yaw: rng() * 6.28,
        mode: 'fly', modeT: 0, slot: -1, tilt: 0, inflate: 1, lean: new THREE.Vector2(),
      };
      this.items.push(it);
    }
    // spread the flyers over the whole region at varied heights
    for (let i = 0; i < FLYERS; i++) this.spawn(this.items[i], true);
    // the dawn mass launch: a dozen balloons already up and climbing around the launch field
    for (let i = 0; i < 12; i++) {
      const it = this.items[i];
      const x = SITES.launch.x - 450 + rng() * 1100, z = SITES.launch.z - 350 + rng() * 650;
      const g = this.data.height(x, z);
      it.p.set(x, g + 30 + rng() * 200, z);
      it.target = it.p.y + 60 + rng() * 200; it.x = 4 + rng() * 6;
    }
    // launch field slots
    this.slots = [];
    for (let k = 0; k < LAUNCH; k++) {
      const a = -0.6 + k * 0.45;
      const x = SITES.launch.x - 60 + Math.cos(a) * 85 - k * 18, z = SITES.launch.z + Math.sin(a) * 85 - 30 + k * 22;
      this.slots.push({ x, z, dir: 0.4 + k * 0.25, busy: null });
    }
    // the launch slots start at different stages: one standing, one rising, two still lying
    for (let k = 0; k < LAUNCH; k++) this.toLaunch(this.items[FLYERS + k], k, [0, 0, 20, 45][k]);
    { const a = this.items[FLYERS], b = this.items[FLYERS + 1];
      a.mode = 'standing'; a.modeT = 2; a.tilt = 1; a.inflate = 1;
      b.mode = 'rising'; b.modeT = 4; b.tilt = 0.45; b.inflate = 1; }

    // meshes
    this.envMat = envelopeMaterial(true);
    this.envMat.uniforms.uFlameI.value = 1.1;
    this.lods = [0, 1, 2].map(l => {
      const geo = envWithSkirt(l);
      const bal = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); bal.setUsage(THREE.DynamicDrawUsage);
      const bal2 = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); bal2.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aBal', bal); geo.setAttribute('aBal2', bal2);
      const m = new THREE.InstancedMesh(geo, this.envMat, N);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false; m.count = 0;
      m.layers.enable(2); m.layers.enable(3);
      addCaster(m);
      scene.add(m);
      return { m, bal, bal2 };
    });
    this.propMat = propMaterial(false);
    this.baskets = new THREE.InstancedMesh(fleetBasket(), this.propMat, N);
    this.baskets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.baskets.frustumCulled = false; this.baskets.layers.enable(2); this.baskets.layers.enable(3);
    addCaster(this.baskets);
    scene.add(this.baskets);
    const fg = FLAME_GEO.clone();
    this.flameAttr = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4); this.flameAttr.setUsage(THREE.DynamicDrawUsage);
    fg.setAttribute('aFlame', this.flameAttr);
    const fm = flameMaterial(true);
    fm.uniforms.uLen.value = 3.6; fm.uniforms.uWid.value = 0.42;
    this.flames = new THREE.InstancedMesh(fg, fm, N);
    this.flames.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flames.frustumCulled = false; this.flames.layers.set(4); this.flames.renderOrder = 10;
    scene.add(this.flames);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._s = new THREE.Vector3();
    this._w = new THREE.Vector3(); this._e = new THREE.Euler(); this._p = new THREE.Vector3();
    this._f = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._sph = new THREE.Sphere();
    this.hero = null;
  }

  spawn(it, anywhere) {
    const r = this.rng;
    const x = anywhere ? -2300 + r() * 4600 : -2600 - r() * 300;
    const z = -900 + r() * 1800;
    const g = this.data.height(x, z);
    const alt = Math.max(g + 40, 60 + r() * 480);
    it.p.set(x, alt, z); it.v.set(0, 0, 0); it.x = 0; it.target = alt; it.retarget = 20 + r() * 60;
    it.mode = 'fly'; it.inflate = 1; it.tilt = 0;
  }
  toLaunch(it, k, t0 = 0) {
    const sl = this.slots[k];
    sl.busy = it;
    it.slot = k; it.mode = 'lying'; it.modeT = t0; it.inflate = 0.45; it.tilt = 0;
    const g = this.data.height(sl.x, sl.z);
    it.p.set(sl.x, g, sl.z); it.v.set(0, 0, 0); it.x = 0; it.yaw = sl.dir;
  }

  update(dt, t, camera) {
    const R = this.rng;
    for (const it of this.items) {
      it.modeT += dt;
      if (it.mode === 'fly') this.fly(it, dt, t);
      else this.launchStep(it, dt, t);
      it.flame += ((it.burn ? 1 : 0) - it.flame) * Math.min(1, dt * (it.burn ? 8 : 12));
    }
    // recycle: a flyer far downwind (and out of sight) becomes the next envelope laid out at launch
    for (const sl of this.slots) {
      if (sl.busy) continue;
      let cand = null;
      for (const it of this.items) if (it.mode === 'fly' && it.p.x > 2400 && it.p.distanceTo(camera.position) > 1500) { cand = it; break; }
      if (!cand) for (const it of this.items) if (it.mode === 'fly' && (Math.abs(it.p.z) > 1250 || it.p.x > 2700) && it.p.distanceTo(camera.position) > 1500) { cand = it; break; }
      if (cand) this.toLaunch(cand, this.slots.indexOf(sl));
    }
    this.render(camera, t);
  }

  fly(it, dt, t) {
    const R = this.rng;
    it.retarget -= dt;
    const g = this.data.height(it.p.x, it.p.z);
    if (it.retarget < 0) { it.target = Math.max(g + 45, 50 + R() * 500); it.retarget = 50 + R() * 90; }
    // keep clear of the ground and rocks ahead
    let minAlt = g + 32;
    for (let s = 10; s <= 30; s += 10) minAlt = Math.max(minAlt, this.data.height(it.p.x + it.v.x * s, it.p.z + it.v.z * s) + 34);
    for (const o of this.rocks.near(it.p.x, it.p.z)) minAlt = Math.max(minAlt, o.y + o.h + 14);
    const target = Math.max(it.target, minAlt);
    const err = target - it.p.y;
    const dvy = Math.max(-2.5, Math.min(3, err * 0.05));
    const needX = dvy * Math.abs(dvy) * DRAG_K / LIFT_K + (dvy - it.v.y) * 4;
    it.cool -= dt;
    if (it.hold > 0) { it.hold -= dt; it.burn = 1; if (it.hold <= 0) { it.burn = 0; it.cool = 2 + R() * 6; } }
    else if (it.cool <= 0 && it.x < needX - 2) { it.hold = 2 + R() * 3; it.burn = 1; }
    const vent = it.x > needX + 8 && err < -15 ? 1 : 0;
    it.x += (B_RATE * it.burn - COOL * (it.x + T_EQ) - 6 * vent) * dt;
    it.x = Math.max(-30, Math.min(45, it.x));
    const w = this.wind.at(it.p.x, it.p.y + 8, it.p.z, this._w);
    let ay = LIFT_K * it.x - DRAG_K * it.v.y * Math.abs(it.v.y);
    let ax = (w.x - it.v.x) / 6, az = (w.z - it.v.z) / 6;
    // separation from each other and the hero
    for (const o of this.items) {
      if (o === it || o.mode !== 'fly') continue;
      const dx = it.p.x - o.p.x, dy = it.p.y - o.p.y, dz = it.p.z - o.p.z;
      const d2 = dx * dx + dy * dy * 0.6 + dz * dz;
      const md = 24 * (it.s + o.s) * 0.5;
      if (d2 < md * md) { const d = Math.sqrt(d2) + 1e-3, k = (md - d) * 0.8; ax += dx / d * k; ay += dy / d * k * 0.5; az += dz / d * k; }
    }
    if (this.hero) {
      const hp = this.hero.flight.p;
      const dx = it.p.x - hp.x, dy = it.p.y - hp.y, dz = it.p.z - hp.z, d = Math.hypot(dx, dy * 0.8, dz) + 1e-3;
      if (d < 26) { const k = (26 - d) * 0.8; ax += dx / d * k; ay += dy / d * k * 0.5; az += dz / d * k; }
    }
    if (it.p.y - 5 * it.s < g + 2) { ay += (g + 2 - (it.p.y - 5 * it.s)) * 4; }
    it.v.x += ax * dt; it.v.y += ay * dt; it.v.z += az * dt;
    it.p.addScaledVector(it.v, dt);
    it.yaw += Math.sin(t * 0.03 + it.seed * 20) * 0.02 * dt;
    it.lean.set(Math.sin(t * 0.2 + it.seed * 9) * 0.02, Math.cos(t * 0.17 + it.seed * 5) * 0.02);
  }

  launchStep(it, dt, t) {
    const sl = this.slots[it.slot];
    const g = this.data.height(sl.x, sl.z);
    if (it.mode === 'lying') {
      // hot inflation: burner flares sideways into the mouth, envelope swells on the ground
      it.burn = (it.modeT % 6) < 2.4 && it.modeT > 3 ? 1 : 0;
      it.inflate = Math.min(1, 0.45 + it.modeT / 70);
      if (it.modeT > 70) { it.mode = 'rising'; it.modeT = 0; }
    } else if (it.mode === 'rising') {
      it.burn = (it.modeT % 3) < 2 ? 1 : 0;
      it.tilt = Math.min(1, it.modeT / 9);
      if (it.modeT > 9) { it.mode = 'standing'; it.modeT = 0; }
    } else if (it.mode === 'standing') {
      it.burn = (it.modeT % 4) < 1.8 ? 1 : 0;
      it.tilt = 1;
      if (it.modeT > 14) { it.mode = 'fly'; it.modeT = 0; it.x = 6; it.target = 80 + this.rng() * 300; it.retarget = 60; sl.busy = null; it.slot = -1; it.p.y = g + 5 * it.s; }
    }
    if (it.mode !== 'fly') {
      it.p.set(sl.x, g, sl.z);
    }
  }

  render(camera, t) {
    this._pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._f.setFromProjectionMatrix(this._pm);
    const counts = [0, 0, 0];
    let nb = 0, nf = 0;
    for (const it of this.items) {
      const s = it.s;
      // transform: mouth-local origin
      let pos = this._p.copy(it.p);
      const q = this._q;
      let deflate = 0, lying = 0, ground = 0;
      if (it.mode === 'fly') {
        this._e.set(it.lean.y, it.yaw, it.lean.x, 'YXZ');
        q.setFromEuler(this._e);
      } else {
        // lying envelope: axis horizontal, mouth toward the basket; tilt brings it upright
        const g = it.p.y;
        const tilt = it.tilt;
        const ang = (1 - tilt) * Math.PI / 2;
        this._e.set(0, it.yaw, 0, 'YXZ');
        q.setFromEuler(this._e);
        this._q2.setFromAxisAngle(this._s.set(0, 0, 1), -ang);
        q.multiply(this._q2);
        // mouth sits near the ground when lying, at hanging height when upright
        const mouthY = g + 2.4 * s * (1 - tilt) + 5 * s * tilt;
        pos.set(it.p.x, mouthY, it.p.z);
        lying = 1 - tilt; ground = g;
        if (it.mode === 'standing') pos.y = g + 5 * s;
      }
      this._sph.center.copy(pos).y += 10 * s; this._sph.radius = 16 * s;
      const dist = camera.position.distanceTo(this._sph.center);
      const vis = this._f.intersectsSphere(this._sph) || dist < 400;
      if (vis) {
        const l = G.tier === 'lite' ? (dist < 150 ? 1 : 2) : dist < 280 ? 0 : dist < 1300 ? 1 : 2;
        const L = this.lods[l];
        const k = counts[l]++;
        const sx = it.mode === 'lying' ? s * (0.75 + 0.25 * it.inflate) : s;
        this._m.compose(pos, q, this._s.set(sx, s * (it.mode === 'lying' ? 0.9 + 0.1 * it.inflate : 1), sx));
        L.m.setMatrixAt(k, this._m);
        L.bal.setXYZW(k, it.pal, it.pat, it.flame, it.seed);
        L.bal2.setXYZW(k, lying, ground, it.inflate, 0);
      }
      // basket: hangs below when upright; lies on its side by the mouth during inflation
      if (vis || dist < 2500) {
        if (it.mode === 'fly' || it.mode === 'standing') {
          this._e.set(0, it.yaw, 0, 'YXZ'); q.setFromEuler(this._e);
          this._m.compose(pos, q, this._s.set(s, s, s));
          this.baskets.setMatrixAt(nb++, this._m);
          // flame from the burner up into the mouth
          const fp = this._s.set(0, -5 * s + 2.75 * s, 0).applyQuaternion(q).add(pos);
          this._m.compose(fp, q, this._w.set(s, s, s));
          this.flames.setMatrixAt(nf, this._m);
          this.flameAttr.setXYZW(nf++, it.flame, it.seed * 10, 0, 0);
        } else {
          // basket on its side: burner pointing horizontally into the mouth
          this._e.set(0, it.yaw, 0, 'YXZ'); const qy = new THREE.Quaternion().setFromEuler(this._e);
          const qs = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 2 * (1 - it.tilt));
          const qq = qy.clone().multiply(qs);
          const back = new THREE.Vector3(-(5 * s), 0, 0).applyQuaternion(qy);
          const bp = new THREE.Vector3(it.p.x, it.p.y + 0.9, it.p.z).add(back);
          const bpos = bp.clone().add(new THREE.Vector3(0, 5 * s, 0).applyQuaternion(qq));
          this._m.compose(bpos, qq, this._s.set(s, s, s));
          this.baskets.setMatrixAt(nb++, this._m);
          const fp = new THREE.Vector3(0, -5 * s + 2.75 * s, 0).applyQuaternion(qq).add(bpos);
          this._m.compose(fp, qq, this._w.set(s * 1.3, s * 1.3, s * 1.3));
          this.flames.setMatrixAt(nf, this._m);
          this.flameAttr.setXYZW(nf++, it.flame, it.seed * 10, 0, 0);
        }
      }
    }
    for (let l = 0; l < 3; l++) {
      const L = this.lods[l];
      L.m.count = counts[l];
      L.m.instanceMatrix.needsUpdate = true; L.bal.needsUpdate = true; L.bal2.needsUpdate = true;
    }
    this.baskets.count = nb; this.baskets.instanceMatrix.needsUpdate = true;
    this.flames.count = nf; this.flames.instanceMatrix.needsUpdate = true; this.flameAttr.needsUpdate = true;
  }
}
