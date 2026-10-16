// Three camera modes and a shared collision solver that keeps every camera out of the
// envelope, basket, rocks, other balloons and terrain.
import * as THREE from 'three';
import { envelopeRadiusAt, ENV } from '../balloon/envelope.js';
import { HANG } from '../balloon/flight.js';

const ER = [];
for (let y = -2; y <= 24; y += 0.25) ER.push(Math.max(envelopeRadiusAt(y), y < 0 && y > -1.6 ? ENV.mouthR + 0.4 : 0));
const envR = y => { const i = Math.round((y + 2) / 0.25); return i < 0 || i >= ER.length ? 0 : ER[i]; };

const smooth = t => t * t * (3 - 2 * t);

export class Cameras {
  constructor(camera, hero, data, rocks, input) {
    this.cam = camera; this.hero = hero; this.data = data; this.rocks = rocks; this.input = input;
    this.mode = 0;
    this.fleet = null;
    // chase orbit
    this.yaw = 2.6; this.pitch = 0.1; this.dist = 52; this.distT = 52; this.drift = 0;
    // first person look
    this.fpYaw = Math.PI / 2; this.fpPitch = -0.3;
    // cinematic
    this.shot = null; this.shotT = 0; this.shotIdx = 0;
    this.blend = 1; this.fromPos = new THREE.Vector3(); this.fromQuat = new THREE.Quaternion();
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this._v = new THREE.Vector3(); this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion();
    this.tmpCam = new THREE.Object3D();
    this.smoothPos = new THREE.Vector3(); this.inited = false;
    this.fixed = null;
  }
  setMode(m) {
    const prev = this.mode;
    this.mode = m === undefined ? (this.mode + 1) % 3 : m;
    this.fromPos.copy(this.cam.position); this.fromQuat.copy(this.cam.quaternion);
    this.blend = this.mode === 1 || prev === 1 ? 1 : 0;
    if (this.mode === 2) { this.shot = null; this.shotT = 99; }
    this.cam.near = this.mode === 1 ? 0.04 : 0.3;
    this.cam.updateProjectionMatrix();
  }

  // --- collision ---
  blocked(p) {
    const g = this.data.height(p.x, p.z);
    if (p.y < g + 1.6) return true;
    for (const o of this.rocks.near(p.x, p.z)) {
      const r = this.rocks.radiusAt(o, p.y);
      if (r >= 0 && Math.hypot(p.x - o.x, p.z - o.z) < r + 1.5) return true;
    }
    if (this.fleet) for (const b of this.fleet.items) {
      const dx = p.x - b.p.x, dy = p.y - (b.p.y + 10), dz = p.z - b.p.z;
      if (dx * dx + dz * dz + dy * dy * 0.5 < 13 * 13) return true;
    }
    return false;
  }
  solve(pos, target, skipHero = false) {
    // spring arm toward the target
    const N = 28;
    const dir = this._v.subVectors(pos, target);
    const len = dir.length();
    let ok = 1;
    for (let i = 1; i <= N; i++) {
      const f = i / N;
      const q = new THREE.Vector3().copy(target).addScaledVector(dir, f);
      if (this.blocked(q) && f * len > 6) { ok = (i - 1) / N; break; }
    }
    pos.copy(target).addScaledVector(dir, Math.max(ok, 6 / Math.max(len, 6)));
    if (!skipHero) this.pushOutHero(pos);
    // terrain and rocks last, hard
    for (let it = 0; it < 3; it++) {
      const g = this.data.height(pos.x, pos.z);
      if (pos.y < g + 1.6) pos.y = g + 1.6;
      for (const o of this.rocks.near(pos.x, pos.z)) {
        const r = this.rocks.radiusAt(o, pos.y);
        if (r < 0) continue;
        const dx = pos.x - o.x, dz = pos.z - o.z, d = Math.hypot(dx, dz) + 1e-4;
        if (d < r + 1.5) { pos.x = o.x + dx / d * (r + 1.5); pos.z = o.z + dz / d * (r + 1.5); }
      }
      if (this.fleet) for (const b of this.fleet.items) {
        const c = this._v.set(b.p.x, b.p.y + 10, b.p.z);
        const d = pos.distanceTo(c);
        if (d < 14) pos.copy(c).addScaledVector(this._v.subVectors(pos, c).normalize(), 14);
      }
      if (!skipHero) this.pushOutHero(pos);
    }
    return pos;
  }
  pushOutHero(pos) {
    const H = this.hero;
    // envelope, in its local frame (mouth at origin)
    this._m.copy(H.env.matrixWorld).invert();
    const l = pos.clone().applyMatrix4(this._m);
    const R = envR(l.y);
    if (l.y > -1.8 && l.y < 22.6) {
      const r = Math.hypot(l.x, l.z);
      const need = R + 1.8;
      if (r < need) {
        if (r < 1e-3) { l.x = need; } else { l.x *= need / r; l.z *= need / r; }
      }
    } else if (l.y >= 22.6 && l.y < 24 && Math.hypot(l.x, l.z) < 3) l.y = 24;
    pos.copy(l.applyMatrix4(H.env.matrixWorld));
    // basket and frame box
    this._m.copy(H.basket.matrixWorld).invert();
    const b = pos.clone().applyMatrix4(this._m);
    const ex = 1.15 + 0.9, ez = 0.68 + 0.9, y0 = -0.6, y1 = 3.0;
    if (Math.abs(b.x) < ex && Math.abs(b.z) < ez && b.y > y0 && b.y < y1) {
      const dx = ex - Math.abs(b.x), dz = ez - Math.abs(b.z), dy0 = b.y - y0, dy1 = y1 - b.y;
      const m = Math.min(dx, dz, dy0, dy1);
      if (m === dx) b.x = Math.sign(b.x || 1) * ex; else if (m === dz) b.z = Math.sign(b.z || 1) * ez; else if (m === dy0) b.y = y0; else b.y = y1;
      pos.copy(b.applyMatrix4(H.basket.matrixWorld));
    }
    // the cables cone between mouth and frame
    this._m.copy(H.env.matrixWorld).invert();
    const c = pos.clone().applyMatrix4(this._m);
    if (c.y < 0 && c.y > -HANG + 2.2) {
      const r = Math.hypot(c.x, c.z), need = 2.6 + 0.8;
      if (r < need) { const k = need / Math.max(r, 1e-3); c.x *= k; c.z *= k; pos.copy(c.applyMatrix4(H.env.matrixWorld)); }
    }
  }

  // --- modes ---
  update(dt, t) {
    const H = this.hero, F = H.flight;
    if (H.crew) H.crew.hideHead = this.mode === 1;
    const drag = this.input.consumeDrag();
    const wheel = this.input.consumeWheel();
    this.input.drag.idle += dt;
    if (this.fixed) { this.fixed(this.cam, t); this.cam.updateMatrixWorld(); return; }
    const center = new THREE.Vector3().copy(F.p).add(new THREE.Vector3(0, 5, 0));
    let pos = new THREE.Vector3(), look = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    let fov = 50;
    if (this.mode === 0) {
      this.yaw -= drag.x * 0.005; this.pitch = Math.max(-0.35, Math.min(1.3, this.pitch + drag.y * 0.004));
      this.distT = Math.max(24, Math.min(240, this.distT * Math.pow(1.12, wheel)));
      this.dist += (this.distT - this.dist) * Math.min(1, dt * 4);
      // slow cinematic drift when left alone
      if (this.input.drag.idle > 4) { this.yaw += dt * 0.03 * Math.sin(t * 0.05 + 1.0); this.pitch += (0.12 + 0.08 * Math.sin(t * 0.07) - this.pitch) * dt * 0.05; }
      const cp = Math.cos(this.pitch);
      pos.set(center.x + Math.cos(this.yaw) * cp * this.dist, center.y + Math.sin(this.pitch) * this.dist, center.z + Math.sin(this.yaw) * cp * this.dist);
      look.copy(center).add(new THREE.Vector3(0, -1.5, 0));
      this.solve(pos, center);
      fov = 50;
    } else if (this.mode === 1) {
      this.fpYaw -= drag.x * 0.0035; this.fpPitch = Math.max(-1.1, Math.min(1.5, this.fpPitch - drag.y * 0.0035));
      // the pilot's eyes, under the burner
      const crew = H.crew;
      const el = crew && crew.people[0].eyeLocal ? crew.people[0].eyeLocal : new THREE.Vector3(0, 1.72, 0.24);
      const eye = el.clone().applyMatrix4(H.basket.matrixWorld);
      pos.copy(eye);
      const q = H.basket.quaternion;
      const dir = new THREE.Vector3(Math.cos(this.fpPitch) * Math.cos(this.fpYaw), Math.sin(this.fpPitch), Math.cos(this.fpPitch) * Math.sin(this.fpYaw)).applyQuaternion(q);
      look.copy(pos).add(dir);
      fov = 62;
    } else {
      this.shotT += dt;
      if (!this.shot || this.shotT > this.shot.dur) this.nextShot(center);
      const s = this.shot;
      const k = this.shotT / s.dur;
      s.fn(pos, look, center, k, t);
      this.solve(pos, look.clone(), false);
      fov = s.fov;
    }
    // smooth chase position slightly so collisions never pop
    if (!this.inited || this.mode === 1) { this.smoothPos.copy(pos); this.inited = true; }
    else this.smoothPos.lerp(pos, Math.min(1, dt * (this.mode === 2 ? 6 : 5)));
    this.tmpCam.position.copy(this.smoothPos);
    this.tmpCam.up.copy(up);
    this.tmpCam.lookAt(look);
    // a camera's lookAt points -z; Object3D.lookAt points +z for non-cameras, so flip
    this.tmpCam.rotateY(Math.PI);
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 1.6);
      const b = smooth(this.blend);
      this.cam.position.lerpVectors(this.fromPos, this.tmpCam.position, b);
      this.cam.quaternion.slerpQuaternions(this.fromQuat, this.tmpCam.quaternion, b);
    } else {
      this.cam.position.copy(this.tmpCam.position);
      this.cam.quaternion.copy(this.tmpCam.quaternion);
    }
    if (Math.abs(this.cam.fov - fov) > 0.01) { this.cam.fov += (fov - this.cam.fov) * Math.min(1, dt * 3); this.cam.updateProjectionMatrix(); }
    this.cam.updateMatrixWorld();
  }

  nextShot(center) {
    const F = this.hero.flight;
    const vel = new THREE.Vector3(F.v.x, 0, F.v.z);
    if (vel.lengthSq() < 0.5) vel.set(1, 0, 0);
    vel.normalize();
    const side = new THREE.Vector3(-vel.z, 0, vel.x);
    const types = ['drone', 'close', 'low', 'beneath', 'reveal', 'close2'];
    const type = types[this.shotIdx++ % types.length];
    this.fromPos.copy(this.cam.position); this.fromQuat.copy(this.cam.quaternion);
    this.blend = 0;
    this.shotT = 0;
    const r = Math.random;
    const sgn = r() < 0.5 ? -1 : 1;
    if (type === 'drone') {
      const R = 150 + r() * 70, h = 40 + r() * 50, a0 = Math.atan2(-vel.z, -vel.x) + sgn * 0.8;
      this.shot = { dur: 11, fov: 45, fn: (pos, look, c, k) => { const a = a0 + sgn * k * 0.5; pos.set(c.x + Math.cos(a) * R, c.y + h, c.z + Math.sin(a) * R); look.copy(c); } };
    } else if (type === 'close' || type === 'close2') {
      const a0 = r() * Math.PI * 2, R = 7.5 + r() * 2;
      this.shot = { dur: 9, fov: 52, fn: (pos, look, c, k) => {
        const b = this.hero.basket.position;
        const a = a0 + sgn * k * 0.6;
        pos.set(b.x + Math.cos(a) * R, b.y + 1.8 + (type === 'close2' ? 1.2 : 0), b.z + Math.sin(a) * R);
        look.set(b.x, b.y + 1.5 + (type === 'close2' ? 1.0 : 0), b.z);
      } };
    } else if (type === 'low') {
      // a fixed camera low in the valley ahead, the balloon drifts past overhead
      const ahead = center.clone().addScaledVector(vel, 140 + r() * 60).addScaledVector(side, sgn * (40 + r() * 30));
      const g = this.data.height(ahead.x, ahead.z);
      const p0 = new THREE.Vector3(ahead.x, g + 3 + r() * 5, ahead.z);
      this.shot = { dur: 10, fov: 40, fn: (pos, look, c, k) => { pos.copy(p0).addScaledVector(vel, -k * 8); look.copy(c); } };
    } else if (type === 'beneath') {
      const a0 = r() * Math.PI * 2;
      this.shot = { dur: 8, fov: 58, fn: (pos, look, c, k) => {
        const b = this.hero.basket.position;
        const a = a0 + k * 0.4 * sgn;
        pos.set(b.x + Math.cos(a) * 16, b.y - 7, b.z + Math.sin(a) * 16);
        look.set(c.x, c.y + 10, c.z);
      } };
    } else {
      const off = vel.clone().multiplyScalar(-60).addScaledVector(side, sgn * 30);
      this.shot = { dur: 10, fov: 48, fn: (pos, look, c, k) => {
        pos.set(c.x + off.x * (1 - k * 0.3), c.y + 70 - k * 30, c.z + off.z * (1 - k * 0.3));
        look.copy(c).addScaledVector(vel, 60 * k).add(new THREE.Vector3(0, -20 * k, 0));
      } };
    }
  }
}
