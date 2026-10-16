// Balloon flight model and autopilot.
// Vertical motion comes from envelope air temperature: the burner heats it, it cools on its own,
// the parachute vent dumps heat. That gives the real lag: it keeps climbing after a blast and is
// slow to stop sinking. Horizontal motion is whatever wind layer the balloon sits in, so the
// autopilot steers purely by choosing altitude.
import * as THREE from 'three';
import { ROUTE, SITES } from '../world/layout.js';

const D = Math.PI / 180;
export const HANG = 5.0;          // mouth to basket floor
const T_EQ = 52, B_RATE = 5.2, COOL = 0.021, VENT_RATE = 7.5;
const LIFT_K = 0.034, DRAG_K = 0.045;
const MAN_B = 18, MAN_V = 24;

export class Flight {
  constructor(data, rocks, wind) {
    this.data = data; this.rocks = rocks; this.wind = wind;
    this.p = new THREE.Vector3();
    this.v = new THREE.Vector3();
    this.reset();
    this._w = new THREE.Vector3(); this._w2 = new THREE.Vector3(); this._f = new THREE.Vector3();
    this.fleet = null;
  }
  reset() {
    const L = SITES.launch;
    const gx = L.x + 40, gz = L.z - 10;
    const gy = this.data.height(gx, gz);
    // start already aloft over the launch field, pointed at the first landmark
    this.p.set(gx, gy + HANG + 50, gz);
    this.v.set(0, 0, 0);
    this.x = 0;                  // excess temperature over neutral
    this.heading = Math.atan2(ROUTE[1].z - gz, ROUTE[1].x - gx);
    this.apHeading = this.heading;
    this.v.set(Math.cos(this.heading) * 5.5, 0, Math.sin(this.heading) * 5.5);
    this.burn = 0; this.vent = 0;
    this.burnTimer = 0; this.burnHold = 0; this.burnCooldown = 2;
    this.yaw = Math.PI / 2 - this.heading; this.yawRate = 0;
    this.swing = new THREE.Vector2(); this.swingV = new THREE.Vector2();
    this.lean = new THREE.Vector2();
    this.dent = 0; this.dentV = 0; this.dentDir = new THREE.Vector3(1, 0, 0);
    this.grounded = false;
    this.wp = 1;
    this.targetAlt = this.p.y;
    this.mode = 'flying';       // flying -> landing -> landed
    this.modeT = 0;
    this.manualT = 99;
    this.touchdown = 0;
    this.prevVh = new THREE.Vector2();
    this.accH = new THREE.Vector2();
    this.gust = 0;
    this.relWind = new THREE.Vector3();
    this.clearance = 0;
  }

  groundAt(x, z) { return this.data.height(x, z); }

  // tallest obstacle (terrain or rock) near a point, for planning
  obstacleTop(x, z, r) {
    let h = -1e9;
    for (let a = 0; a < 8; a++) h = Math.max(h, this.groundAt(x + Math.cos(a * Math.PI / 4) * r, z + Math.sin(a * Math.PI / 4) * r));
    h = Math.max(h, this.groundAt(x, z));
    for (const o of this.rocks.near(x, z)) if (Math.hypot(o.x - x, o.z - z) < r + o.rb) h = Math.max(h, o.y + o.h);
    return h;
  }

  autopilot(dt, t) {
    if (this.wp >= ROUTE.length) return;
    const w = ROUTE[this.wp];
    const dx = w.x - this.p.x, dz = w.z - this.p.z;
    const dist = Math.hypot(dx, dz);
    const last = this.wp === ROUTE.length - 1;
    // reached / passed
    const prev = ROUTE[this.wp - 1];
    const segx = w.x - prev.x, segz = w.z - prev.z;
    const along = ((this.p.x - prev.x) * segx + (this.p.z - prev.z) * segz) / (segx * segx + segz * segz);
    if (!last && (dist < 110 || along > 1.0)) { this.wp++; return; }
    if (last && (dist < 140 || along > 1.0) && this.mode === 'flying') { this.mode = 'landing'; this.modeT = 0; }
    // final approach: glide down toward the field so touchdown lands on it, not past it
    if (last && dist < 750) {
      const g = this.groundAt(w.x, w.z);
      const slope = g + HANG + Math.max(8, dist * 0.13);
      this.targetAlt = Math.min(this.targetAlt, slope);
      this.altControl(dt, Math.max(this.targetAlt, this.groundAt(this.p.x, this.p.z) + HANG + 6));
      return;
    }

    // desired heading: aim a little past the waypoint toward the next one
    let ax = w.x, az = w.z;
    if (!last) { const n = ROUTE[this.wp + 1]; const k = Math.max(0, 1 - dist / 260) * 0.5; ax += (n.x - w.x) * k; az += (n.z - w.z) * k; }
    const desired = Math.atan2(az - this.p.z, ax - this.p.x);
    this.apHeading = desired;
    // look ahead along the current drift for terrain and rocks
    const vh = Math.hypot(this.v.x, this.v.z) + 0.1;
    let minSafe = -1e9;
    for (let s = 0; s <= 30; s += 6) {
      const px = this.p.x + this.v.x * s, pz = this.p.z + this.v.z * s;
      minSafe = Math.max(minSafe, this.obstacleTop(px, pz, 14) + HANG + 9);
    }
    const ground = this.groundAt(this.p.x, this.p.z);
    minSafe = Math.max(minSafe, ground + HANG + 12);
    // choose altitude by wind direction
    let best = this.targetAlt, bestCost = 1e9;
    for (let a = Math.max(minSafe, 20); a <= 520; a += 8) {
      const L = this.wind.layerAt(a);
      let dh = Math.abs(((L.hdg * D - desired) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      let cost = dh * dh * 30;
      cost += Math.abs(a - this.p.y) * 0.035;             // don't wander up and down for nothing
      cost += Math.abs(a - (ground + w.alt)) * 0.012;      // scenic preference near landmarks
      cost -= L.spd * 0.15;
      if (a > 380) cost += (a - 380) * 0.05;
      if (cost < bestCost) { bestCost = cost; best = a; }
    }
    // hysteresis keeps it from dithering between layers
    const curCost = (() => {
      const L = this.wind.layerAt(this.targetAlt);
      const dh = Math.abs(((L.hdg * D - desired) + Math.PI * 3) % (Math.PI * 2) - Math.PI);
      return dh * dh * 30 + Math.abs(this.targetAlt - this.p.y) * 0.035 + Math.abs(this.targetAlt - (ground + w.alt)) * 0.012 - L.spd * 0.15;
    })();
    if (bestCost < curCost - 1.5 || this.targetAlt < minSafe) this.targetAlt = Math.max(best, minSafe);
    // dawn: linger low in the fog, then break out above it once the sun is up
    if (this.dawnHold) this.targetAlt = Math.min(this.targetAlt, Math.max(minSafe, this.dawnHold));
    this.altControl(dt, this.targetAlt);
  }

  // burner/vent logic: blasts of a few seconds, like a pilot
  altControl(dt, target) {
    const err = target - this.p.y;
    // predict where temperature will settle the climb rate
    const desiredVy = Math.max(-2.8, Math.min(3.2, err * 0.06));
    const neededX = desiredVy * Math.abs(desiredVy) * DRAG_K / LIFT_K + (desiredVy - this.v.y) * 4;
    this.burnCooldown -= dt;
    if (this.burnHold > 0) { this.burnHold -= dt; this.burn = 1; if (this.burnHold <= 0) { this.burn = 0; this.burnCooldown = 1.2 + Math.random() * 2; } }
    else if (this.burnCooldown <= 0 && this.x < neededX - 1.5) { this.burnHold = 1.6 + Math.min(4, (neededX - this.x) * 0.25) + Math.random() * 0.8; this.burn = 1; }
    this.vent = (this.x > neededX + 7 && err < -10) ? 1 : 0;
  }

  step(dt, t, input) {
    this.modeT += dt;
    const p = this.p, v = this.v;
    // --- control ---
    const manualActive = input.burn || input.vent || input.left || input.right;
    if (manualActive) this.manualT = 0; else this.manualT += dt;
    const manual = this.manualT < 12 && this.mode === 'flying';
    // handing back to the autopilot: pick up the route at the nearest landmark ahead
    if (this.wasManual && !manual) {
      let bi = this.wp, bd = 1e9;
      for (let i = 1; i < ROUTE.length; i++) { const d = Math.hypot(ROUTE[i].x - p.x, ROUTE[i].z - p.z); if (d < bd) { bd = d; bi = i; } }
      if (bi < ROUTE.length - 1) { const a = ROUTE[bi], b = ROUTE[bi + 1]; if ((p.x - a.x) * (b.x - a.x) + (p.z - a.z) * (b.z - a.z) > 0) bi++; }
      this.wp = Math.max(1, bi);
    }
    this.wasManual = manual;
    const turnIn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    if (this.mode === 'prelaunch') {
      this.burn = 0; this.vent = 0;
      // a few warm-up blasts, then lift off
      if (this.modeT > 2 && this.modeT < 9) { this.burn = ((this.modeT % 3.4) < 2.2) ? 1 : 0; }
      if (this.modeT > 9) { this.mode = 'flying'; this.modeT = 0; }
      if (this.modeT > 1.5) this.x = Math.min(this.x + dt * 1.2, 1.2);
    } else if (this.mode === 'flying') {
      if (manual) {
        this.burnHold = 0;
        if (input.burn || input.vent) {
          this.burn = input.burn ? 1 : 0; this.vent = input.vent ? 1 : 0;
          this.holdAlt = null;
        } else {
          // keys released: level off and hold this height, short burner blips as needed
          if (this.holdAlt == null) this.holdAlt = p.y + v.y * 0.7;
          const dvy = Math.max(-2, Math.min(2, (this.holdAlt - p.y) * 0.6));
          const needX = dvy * Math.abs(dvy) * DRAG_K / LIFT_K + (dvy - v.y) * 10;
          this.burn = needX > this.x + 1.5 ? 1 : 0;
          this.vent = needX < this.x - 3 ? 1 : 0;
        }
        this.targetAlt = p.y;
      } else { this.holdAlt = null; this.autopilot(dt, t); }
    } else if (this.mode === 'landing') {
      // ease down onto the field
      const g = this.groundAt(p.x, p.z) + HANG;
      const target = g - 2;
      const err = target - p.y;
      // brisk descent, flaring to a soft touchdown in the last few metres
      const agl = p.y - g;
      const dvy = Math.max(agl > 25 ? -2.6 : -0.9 - agl * 0.06, Math.min(0.4, err * 0.08));
      this.burn = 0;
      if (v.y < dvy - 0.4 && this.x < 2 && this.burnCooldown <= 0) { this.burnHold = 1.2; }
      if (this.burnHold > 0) { this.burnHold -= dt; this.burn = 1; if (this.burnHold <= 0) this.burnCooldown = 2.5; }
      this.burnCooldown -= dt;
      this.vent = v.y > dvy + 0.3 ? 1 : 0;
      if (this.grounded) { this.mode = 'landed'; this.modeT = 0; }
    } else if (this.mode === 'landed') {
      this.burn = 0; this.vent = 1;
    }
    if (this.forceBurn) this.burn = 1;
    // --- thermodynamics ---
    // hand control answers quickly: a held burner or vent works the air several times harder
    const handRates = manual && this.mode === 'flying';
    this.x += ((handRates ? MAN_B : B_RATE) * this.burn - COOL * (this.x + T_EQ) - (handRates ? MAN_V : VENT_RATE) * this.vent) * dt;
    if (handRates && !this.burn && !this.vent) this.x += COOL * T_EQ * dt; // the pilot's blips hold the heat
    this._surge = handRates ? (this.burn ? 0.55 : this.vent ? -0.55 : 0) : 0;
    // cap hand-flown climb and sink at about 4.5 m/s so it stops cleanly when you let go
    if (handRates) this.x = Math.max(-27, Math.min(27, this.x));
    // neutral heat loss is offset on average; model as cooling toward -T_EQ*COOL balance
    this.x += COOL * T_EQ * dt * 0.0;
    this.x = Math.max(-30, Math.min(45, this.x));
    // --- forces ---
    const w = this.wind.at(p.x, p.y + 8, p.z, this._w);
    this.gust = this.wind.gust(p.x, p.z);
    let ay = LIFT_K * this.x - DRAG_K * v.y * Math.abs(v.y) + w.y * 0.3 + (this._surge || 0);
    // horizontal: carried by the air with a few seconds of lag
    let ax, az;
    if (this.mode === 'flying' && !this.grounded) {
      // the balloon holds its own heading: A/D turn it by hand, the autopilot turns it toward the next landmark
      if (manual) this.heading -= turnIn * 0.55 * dt;
      else if (this.apHeading != null) {
        let d = this.apHeading - this.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
        this.heading += Math.max(-0.22 * dt, Math.min(0.22 * dt, d * 0.8 * dt));
      }
      const spd = Math.max(5.5, Math.hypot(w.x, w.z)) * (manual ? 1.1 : 1);
      const tau = manual ? 1.0 : 2.5;
      ax = (Math.cos(this.heading) * spd - v.x) / tau; az = (Math.sin(this.heading) * spd - v.z) / tau;
    } else {
      const tau = this.grounded ? 0.5 : 5.5;
      ax = (w.x - v.x) / tau; az = (w.z - v.z) / tau;
      if (this.grounded) { ax = -v.x * 3; az = -v.z * 3; }
      this.heading = Math.atan2(v.z || 1e-4, v.x || 1);
    }
    // --- collisions: terrain under the basket and around the envelope ---
    const f = this._f.set(0, 0, 0);
    const ground = this.groundAt(p.x, p.z);
    const floorY = p.y - HANG;
    this.grounded = false;
    if (floorY < ground + 0.05) {
      const pen = ground + 0.05 - floorY;
      f.y += pen * 60 - v.y * 6;
      if (pen > 0.02) this.grounded = this.x < 8 || this.mode !== 'flying';
      if (v.y < 0) v.y *= 0.6;
    }
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, cx = Math.cos(a), cz = Math.sin(a);
      for (const [rad, hy] of [[9.6, 12], [6.2, 4.5], [1.6, -HANG + 0.3]]) {
        const h = this.groundAt(p.x + cx * rad, p.z + cz * rad);
        const pen = h - (p.y + hy - (hy > 0 ? 3 : 0));
        if (pen > 0) { f.x -= cx * pen * 4; f.z -= cz * pen * 4; f.y += pen * 1.5; }
      }
    }
    // rocks: chimney cones against the envelope belly and the basket
    const nearList = [];
    for (let gx = -1; gx <= 1; gx++) for (let gz = -1; gz <= 1; gz++) for (const o of this.rocks.near(p.x + gx * 40, p.z + gz * 40)) if (!nearList.includes(o)) nearList.push(o);
    this.clearance = 99;
    for (const o of nearList) {
      const dx = p.x - o.x, dz = p.z - o.z;
      const d = Math.hypot(dx, dz) + 1e-3;
      for (const [hy, er] of [[-HANG + 0.6, 1.4], [2, 3.4], [7, 6.6], [12.5, 8.8], [18, 7.2]]) {
        const y = p.y + hy;
        const rr = this.rocks.radiusAt(o, y);
        if (rr < 0) continue;
        const gap = d - (rr + er + 0.6);
        this.clearance = Math.min(this.clearance, gap);
        if (gap < 0) {
          f.x += dx / d * -gap * 5; f.z += dz / d * -gap * 5;
          if (hy > 0) f.y += -gap * 0.6; else f.y += -gap * 2.5;
          // damp approach velocity
          const vn = (v.x * dx + v.z * dz) / d;
          if (vn < 0) { f.x -= dx / d * vn * 2; f.z -= dz / d * vn * 2; }
        }
      }
    }
    // other balloons
    if (this.fleet) for (const b of this.fleet.items) {
      const dx = p.x - b.p.x, dy = (p.y) - (b.p.y), dz = p.z - b.p.z;
      const d = Math.hypot(dx, dy * 0.8, dz) + 1e-3;
      const gap = d - 21;
      if (gap < 0) { f.x += dx / d * -gap * 1.2; f.y += dy / d * -gap * 0.8; f.z += dz / d * -gap * 1.2; }
    }
    ax += f.x; ay += f.y; az += f.z;
    if (this.mode === 'prelaunch' || this.mode === 'landed') { ax = -v.x * 4 + f.x; az = -v.z * 4 + f.z; }
    v.x += ax * dt; v.y += ay * dt; v.z += az * dt;
    if (this.mode === 'landed') { v.multiplyScalar(Math.max(0, 1 - dt * 3)); }
    p.addScaledVector(v, dt);
    if (p.y - HANG < ground - 0.1) { p.y = ground - 0.1 + HANG; if (v.y < 0) v.y = 0; }
    // tethered until the crew lets go
    if (this.mode === 'prelaunch') { p.y = ground + HANG + 0.02; v.set(0, 0, 0); }

    // --- rotation: slow drift plus the rotation vent ---
    const turn = (input.left ? 1 : 0) - (input.right ? 1 : 0);
    // the basket swings round to face the way it's travelling
    let dyaw = (Math.PI / 2 - this.heading) - this.yaw; dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.yawRate += ((dyaw * 1.6 + turn * 0.0) - this.yawRate) * Math.min(1, dt * 3);
    this.yaw += this.yawRate * dt;

    // --- basket swing: pendulum driven by horizontal acceleration and gusts ---
    const vh = new THREE.Vector2(v.x, v.z);
    this.accH.copy(vh).sub(this.prevVh).divideScalar(Math.max(dt, 1e-3));
    this.prevVh.copy(vh);
    const wq = Math.sqrt(9.81 / HANG);
    for (const k of ['x', 'y']) {
      const a = -wq * wq * this.swing[k] - 2 * 0.18 * wq * this.swingV[k] - this.accH[k] / HANG * 0.6 + (Math.random() - 0.5) * this.gust * 0.06;
      this.swingV[k] += a * dt;
      this.swing[k] += this.swingV[k] * dt;
      this.swing[k] = Math.max(-0.07, Math.min(0.07, this.swing[k]));
    }
    if (this.grounded) { this.swing.multiplyScalar(0.9); this.swingV.multiplyScalar(0.8); }

    // --- envelope: lean and dent from wind shear between crown and basket ---
    const wTop = this.wind.at(p.x, p.y + 20, p.z, this._w2);
    this.relWind.set(wTop.x - v.x, 0, wTop.z - v.z);
    const rel = this.relWind.length();
    const targetLean = new THREE.Vector2(this.relWind.x, this.relWind.z).multiplyScalar(0.012);
    this.lean.lerp(targetLean, Math.min(1, dt * 1.5));
    const targetDent = Math.min(0.5, rel * rel * 0.02 + this.gust * 0.08 * (this.grounded ? 0 : 1));
    this.dentV += ((targetDent - this.dent) * 6 - this.dentV * 2.5) * dt;
    this.dent += this.dentV * dt;
    if (rel > 0.2) this.dentDir.lerp(this._w.set(this.relWind.x / rel, 0, this.relWind.z / rel), Math.min(1, dt * 2)).normalize();
  }
}
