// Pilot and four passengers. Rigid-part skinning: every vertex belongs to one bone, bone
// matrices are solved each frame (2-bone arm IK onto the rim, the blast valve, a camera,
// or pointing over the rim). Hands are always placed on surfaces or in free air above the rim.
import * as THREE from 'three';
import { propMaterial, tag, merge } from './props.js';
import { addCaster } from '../core/mat.js';
import { BASKET } from './rig.js';
import { SITES } from '../world/layout.js';

const B = { PELVIS: 0, CHEST: 1, HEAD: 2, LUA: 3, LFA: 4, LH: 5, RUA: 6, RFA: 7, RH: 8, LTH: 9, LSH: 10, RTH: 11, RSH: 12, CAM: 13 };
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UPY = V3(0, 1, 0), DOWN = V3(0, -1, 0);

function ell(rx, ry, rz, seg = 14, rows = 10) { const g = new THREE.SphereGeometry(1, seg, rows); g.scale(rx, ry, rz); return g; }
function limb(r0, r1, len, seg = 12) { const g = new THREE.CylinderGeometry(r1, r0, len, seg, 3); g.translate(0, -len / 2, 0); return g; }
function lathe(profile, seg = 20, sx = 1, sz = 1) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, seg);
  g.scale(sx, 1, sz);
  return g;
}

// build one person in bind pose; each part in its bone's local frame
function buildPerson(o) {
  const parts = [];
  const add = (g, mat, col, bone) => parts.push(tag(g, mat, col, null, bone));
  const coat = o.coat, coat2 = o.coat2, skin = o.skin;
  // pelvis: coat skirt over the hips with a hem, trousers below
  add(lathe([[0.0, -0.3], [0.165, -0.3], [0.175, -0.26], [0.172, -0.1], [0.16, 0.05], [0.148, 0.12], [0.0, 0.12]], 22, 1, 0.74), 9, coat, B.PELVIS);
  const hem = new THREE.TorusGeometry(0.168, 0.012, 6, 24); hem.rotateX(Math.PI / 2); hem.scale(1, 1, 0.74); hem.translate(0, -0.29, 0); add(hem, 9, coat2, B.PELVIS);
  // chest: quilted coat body tapering to the shoulders, a standing collar and a scarf
  add(lathe([[0.0, 0.0], [0.15, 0.0], [0.163, 0.1], [0.172, 0.24], [0.165, 0.36], [0.13, 0.43], [0.075, 0.47], [0.0, 0.475]], 22, 1.12, 0.7), 9, coat, B.CHEST);
  for (let k = 0; k < 4; k++) { const q = new THREE.TorusGeometry(0.168, 0.006, 4, 24); q.rotateX(Math.PI / 2); q.scale(1.12, 1, 0.7); q.translate(0, 0.07 + k * 0.08, 0); add(q, 9, coat2, B.CHEST); }
  const zip = new THREE.BoxGeometry(0.01, 0.4, 0.01); zip.translate(0, 0.22, 0.118); add(zip, 2, [1, 1, 1], B.CHEST);
  const collar = new THREE.CylinderGeometry(0.068, 0.078, 0.07, 16, 1, true); collar.translate(0, 0.49, 0); add(collar, 9, coat, B.CHEST);
  const scarf = new THREE.TorusGeometry(0.07, 0.026, 8, 18); scarf.rotateX(Math.PI / 2); scarf.translate(0, 0.47, 0.005); add(scarf, 14, o.scarf, B.CHEST);
  const tail = new THREE.BoxGeometry(0.055, 0.2, 0.022); tail.translate(0.045, 0.36, 0.115); tail.rotateZ(0.04); add(tail, 14, o.scarf, B.CHEST);
  for (const s of [-1, 1]) { const pk = new THREE.BoxGeometry(0.08, 0.06, 0.02); pk.translate(s * 0.09, 0.05, 0.112); add(pk, 9, coat2, B.CHEST); }
  // head: cranium, jaw and chin, nose, ears, eyes, brows, mouth
  add(ell(0.083, 0.098, 0.09), 10, skin, B.HEAD);
  add(ell(0.066, 0.05, 0.072, 0, -0.055, 0.018), 10, skin, B.HEAD);
  const nose = new THREE.ConeGeometry(0.014, 0.036, 8); nose.rotateX(Math.PI / 2 - 0.25); nose.translate(0, -0.012, 0.094); add(nose, 10, skin.map(c => c * 0.95), B.HEAD);
  for (const s of [-1, 1]) {
    const ear = ell(0.012, 0.025, 0.017, 8, 6); ear.translate(s * 0.083, -0.005, -0.005); add(ear, 10, skin.map(c => c * 0.92), B.HEAD);
    const white = ell(0.013, 0.008, 0.006, 8, 6); white.translate(s * 0.03, 0.015, 0.08); add(white, 10, [0.85, 0.83, 0.8], B.HEAD);
    const iris = ell(0.006, 0.006, 0.004, 6, 4); iris.translate(s * 0.03, 0.015, 0.0855); add(iris, 13, [0.04, 0.03, 0.025], B.HEAD);
    const brow = new THREE.BoxGeometry(0.03, 0.006, 0.008); brow.rotateZ(s * -0.12); brow.translate(s * 0.03, 0.035, 0.084); add(brow, 11, o.hair, B.HEAD);
    const cheek = ell(0.02, 0.014, 0.01, 8, 6); cheek.translate(s * 0.045, -0.03, 0.07); add(cheek, 10, [skin[0] * 1.08, skin[1] * 0.9, skin[2] * 0.85], B.HEAD);
  }
  const mouth = new THREE.BoxGeometry(0.03, 0.005, 0.006); mouth.translate(0, -0.05, 0.085); add(mouth, 10, skin.map(c => c * 0.55), B.HEAD);
  if (o.beard) { const bd = ell(0.06, 0.04, 0.05, 0, -0.07, 0.04); add(bd, 11, o.hair, B.HEAD); }
  if (o.hairBack) { const hb = ell(0.084, 0.085, 0.07, 10, 8); hb.translate(0, -0.03, -0.035); add(hb, 11, o.hair, B.HEAD); }
  if (o.hat === 'beanie') {
    const h = new THREE.SphereGeometry(0.091, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52); h.scale(1, 1.08, 1.02); h.translate(0, 0.012, -0.004); add(h, 14, o.hatCol, B.HEAD);
    const cuff = new THREE.TorusGeometry(0.088, 0.014, 6, 22); cuff.rotateX(Math.PI / 2); cuff.translate(0, 0.022, -0.004); add(cuff, 14, o.hatCol.map(c => c * 0.8), B.HEAD);
    const pom = ell(0.027, 0.027, 0.027, 10, 8); pom.translate(0, 0.112, -0.008); add(pom, 11, o.scarf, B.HEAD);
  } else if (o.hat === 'cap') {
    const h = new THREE.SphereGeometry(0.089, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5); h.translate(0, 0.022, 0); add(h, 9, o.hatCol, B.HEAD);
    const brim = new THREE.CylinderGeometry(0.06, 0.06, 0.008, 14, 1, false, -Math.PI / 2, Math.PI); brim.scale(1, 1, 1.25); brim.translate(0, 0.024, 0.062); add(brim, 9, o.hatCol, B.HEAD);
  } else {
    // fur trapper hat with ear flaps
    const h = new THREE.SphereGeometry(0.095, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55); h.translate(0, 0.016, 0); add(h, 11, o.hatCol, B.HEAD);
    const rim = new THREE.TorusGeometry(0.092, 0.02, 6, 22); rim.rotateX(Math.PI / 2); rim.translate(0, 0.02, 0); add(rim, 11, o.hatCol.map(c => c * 1.2), B.HEAD);
    for (const s of [-1, 1]) { const f = ell(0.022, 0.055, 0.045, 8, 6); f.translate(s * 0.088, -0.03, -0.005); add(f, 11, o.hatCol.map(c => c * 1.2), B.HEAD); }
  }
  const neck = limb(0.042, 0.046, 0.1, 10); neck.translate(0, -0.06, -0.008); add(neck, 10, skin, B.HEAD);
  // arms: shoulder caps, sleeves with a crease at the elbow, ribbed cuffs, mittens with thumbs
  for (const [ua, fa, hd, s] of [[B.LUA, B.LFA, B.LH, -1], [B.RUA, B.RFA, B.RH, 1]]) {
    add(ell(0.06, 0.058, 0.058), 9, coat, ua);
    add(limb(0.054, 0.047, o.ua), 9, coat, ua);
    add(ell(0.046, 0.046, 0.046), 9, coat, fa);
    add(limb(0.045, 0.04, o.fa), 9, coat, fa);
    const cuff = limb(0.042, 0.042, 0.035); cuff.translate(0, -o.fa + 0.03, 0); add(cuff, 14, coat2, fa);
    const m = ell(0.038, 0.068, 0.026, 10, 8); m.translate(0, -0.065, 0); add(m, 12, o.glove, hd);
    const th = ell(0.013, 0.03, 0.013, 6, 6); th.rotateZ(s * 0.6); th.translate(s * 0.034, -0.032, 0.01); add(th, 12, o.glove, hd);
  }
  // legs (mostly hidden by the basket wall, visible from inside)
  for (const [th, sh] of [[B.LTH, B.LSH], [B.RTH, B.RSH]]) {
    add(limb(0.078, 0.06, 0.44), 9, o.trousers, th);
    add(limb(0.056, 0.047, 0.42), 9, o.trousers, sh);
    const boot = ell(0.05, 0.05, 0.115, 10, 8); boot.translate(0, -0.44, 0.04); add(boot, 12, [0.08, 0.06, 0.05], sh);
    const shaft = limb(0.055, 0.052, 0.14); shaft.translate(0, -0.3, 0); add(shaft, 12, [0.1, 0.07, 0.05], sh);
  }
  if (o.camera) {
    const body = new THREE.BoxGeometry(0.12, 0.075, 0.06); add(body, 13, [0.06, 0.06, 0.07], B.CAM);
    const grip = new THREE.BoxGeometry(0.03, 0.07, 0.065); grip.translate(0.05, 0, 0.005); add(grip, 13, [0.03, 0.03, 0.03], B.CAM);
    const lens = new THREE.CylinderGeometry(0.03, 0.032, 0.07, 16); lens.rotateX(Math.PI / 2); lens.translate(-0.01, 0, 0.06); add(lens, 13, [0.03, 0.03, 0.03], B.CAM);
    const ring = new THREE.TorusGeometry(0.031, 0.004, 6, 16); ring.translate(-0.01, 0, 0.095); add(ring, 2, [1, 1, 1], B.CAM);
  }
  return merge(parts);
}

const PEOPLE = [
  { name: 'pilot', beard: true, coat: [0.05, 0.07, 0.12], coat2: [0.1, 0.1, 0.1], scarf: [0.55, 0.08, 0.06], skin: [0.62, 0.43, 0.32], hair: [0.12, 0.08, 0.05], hat: 'cap', hatCol: [0.08, 0.08, 0.09], glove: [0.12, 0.09, 0.07], trousers: [0.12, 0.12, 0.13], ua: 0.3, fa: 0.28, h: 1.0, camera: false, hairBack: true },
  { name: 'p1', coat: [0.42, 0.06, 0.07], coat2: [0.2, 0.03, 0.03], scarf: [0.85, 0.8, 0.7], skin: [0.75, 0.55, 0.45], hair: [0.35, 0.2, 0.1], hat: 'beanie', hatCol: [0.85, 0.82, 0.75], glove: [0.25, 0.12, 0.08], trousers: [0.08, 0.08, 0.12], ua: 0.28, fa: 0.26, h: 0.95, camera: true, hairBack: true },
  { name: 'p2', coat: [0.08, 0.16, 0.3], coat2: [0.04, 0.08, 0.16], scarf: [0.9, 0.6, 0.12], skin: [0.45, 0.3, 0.22], hair: [0.05, 0.04, 0.03], hat: 'trapper', hatCol: [0.35, 0.25, 0.16], glove: [0.05, 0.05, 0.06], trousers: [0.2, 0.18, 0.15], ua: 0.3, fa: 0.28, h: 1.0, camera: false, hairBack: false },
  { name: 'p3', coat: [0.6, 0.43, 0.13], coat2: [0.35, 0.22, 0.05], scarf: [0.12, 0.3, 0.25], skin: [0.8, 0.62, 0.52], hair: [0.6, 0.45, 0.25], hat: 'beanie', hatCol: [0.1, 0.3, 0.28], glove: [0.4, 0.3, 0.2], trousers: [0.1, 0.1, 0.1], ua: 0.27, fa: 0.25, h: 0.93, camera: true, hairBack: true },
  { name: 'p4', coat: [0.12, 0.28, 0.14], coat2: [0.05, 0.12, 0.06], scarf: [0.6, 0.12, 0.3], skin: [0.58, 0.4, 0.3], hair: [0.2, 0.12, 0.06], hat: 'beanie', hatCol: [0.55, 0.1, 0.12], glove: [0.15, 0.1, 0.08], trousers: [0.15, 0.13, 0.12], ua: 0.29, fa: 0.27, h: 0.98, camera: false, hairBack: false },
];

// standing slots: position, facing (yaw so +z of the body faces outward)
const SLOTS = [
  { x: 0.0, z: 0.16, face: 0 },            // pilot faces +z toward the valves
  { x: 0.80, z: 0.31, face: 0 },
  { x: 0.80, z: -0.31, face: Math.PI },
  { x: -0.80, z: 0.31, face: 0 },
  { x: -0.80, z: -0.31, face: Math.PI },
];

const LANDMARKS = ['church', 'dovecote', 'castle', 'bridge', 'horses', 'vineyard', 'landing', 'caves'].map(k => SITES[k]);

function solveArm(shoulder, target, la, lb, pole) {
  // returns elbow position for a 2-bone chain reaching toward target
  const d = target.clone().sub(shoulder);
  let dist = d.length();
  const maxR = (la + lb) * 0.995;
  if (dist > maxR) { d.multiplyScalar(maxR / dist); dist = maxR; target = shoulder.clone().add(d); }
  dist = Math.max(dist, Math.abs(la - lb) + 0.01);
  const a = (la * la - lb * lb + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, la * la - a * a));
  const dir = d.clone().normalize();
  const pl = pole.clone().sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
  return { elbow: shoulder.clone().addScaledVector(dir, a).addScaledVector(pl, h), wrist: target };
}
function boneFrom(pos, dirDown, fwd) {
  // bone whose local -Y points along dirDown, local +Z roughly along fwd
  const y = dirDown.clone().negate().normalize();
  let z = fwd.clone().sub(y.clone().multiplyScalar(fwd.dot(y)));
  if (z.lengthSq() < 1e-6) z = V3(0, 0, 1).sub(y.clone().multiplyScalar(y.z));
  z.normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  z.crossVectors(x, y);
  const m = new THREE.Matrix4().makeBasis(x, y, z);
  m.setPosition(pos);
  return m;
}

export class Crew {
  constructor(hero) {
    this.hero = hero;
    this.people = [];
    PEOPLE.forEach((o, i) => {
      const geo = buildPerson(o);
      const mat = propMaterial(true);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false; mesh.layers.enable(2);
      addCaster(mesh);
      hero.basket.add(mesh);
      const slot = SLOTS[i];
      this.people.push({
        o, mesh, mat, slot, i,
        state: i === 0 ? 'pilot' : 'lean', stateT: Math.random() * 3, dur: 4 + Math.random() * 4,
        look: V3(0, 0, 1), lookT: V3(0, 0, 1), handL: null, handR: null, handLT: V3(), handRT: V3(),
        lean: 0.15, phase: Math.random() * 10, flinch: 0, target: null, yawOff: 0, yawOffT: 0,
        mouth: V3(), exhale: 0,
      });
    });
    hero.crew = this;
    this.lastBurn = 0;
    this._m = new THREE.Matrix4(); this._inv = new THREE.Matrix4();
    this.rimY = BASKET.H + 0.045;
  }

  // world direction -> basket-local direction
  toLocalDir(v) { return v.clone().applyQuaternion(this.hero.basket.quaternion.clone().invert()); }

  update(dt, t, hero, st) {
    const F = hero.flight;
    const burnOn = hero.flameI > 0.5 && this.lastBurn <= 0.5;
    this.lastBurn = hero.flameI;
    const gust = F.gust;
    const bInv = this._inv.copy(hero.basket.matrixWorld).invert();
    for (const P of this.people) {
      P.stateT += dt;
      if (burnOn) P.flinch = 1;
      P.flinch = Math.max(0, P.flinch - dt * 1.2);
      if (P.i === 0) this.pilot(P, dt, t, hero, st, bInv);
      else this.passenger(P, dt, t, hero, st, bInv, gust);
    }
  }

  pickTarget(P, hero, bInv) {
    // nearest landmark in front-ish, else another balloon, else the volcano
    const pos = hero.basket.position;
    let best = null, bd = 1e9;
    for (const L of LANDMARKS) {
      const d = Math.hypot(L.x - pos.x, L.z - pos.z);
      if (d < bd && d < 900) { bd = d; best = V3(L.x, hero.flight.groundAt(L.x, L.z) + 10, L.z); }
    }
    if (!best || Math.random() < 0.35) {
      const f = hero.flight.fleet;
      if (f) { const it = f.items[Math.floor(Math.random() * f.items.length)]; best = it.p.clone().add(V3(0, 10, 0)); }
    }
    if (!best) best = V3(6500, 2000, -17500);
    return best.applyMatrix4(bInv);
  }

  passenger(P, dt, t, hero, st, bInv, gust) {
    const s = P.slot, o = P.o;
    const face = s.face;
    const out = V3(Math.sin(face), 0, Math.cos(face)); // outward
    // state machine
    if (P.stateT > P.dur) {
      P.stateT = 0;
      const r = Math.random();
      P.state = r < 0.35 ? 'lean' : r < 0.6 ? 'point' : r < 0.82 && o.camera ? 'camera' : 'look';
      P.dur = P.state === 'lean' ? 4 + Math.random() * 5 : 3.5 + Math.random() * 3.5;
      P.target = this.pickTarget(P, hero, bInv);
    }
    // a strong gust: grab the rim
    if (gust > 0.75 && P.state !== 'lean') { P.state = 'lean'; P.stateT = 0; P.dur = 3; }
    // where to look (basket-local)
    const pelvisPos = V3(s.x, 0.95 * o.h, s.z);
    let lookTarget;
    if (P.target && P.state !== 'lean') lookTarget = P.target.clone();
    else lookTarget = pelvisPos.clone().add(out.clone().multiplyScalar(10)).add(V3(Math.sin(t * 0.13 + P.phase) * 5, -2 + Math.sin(t * 0.07 + P.phase) * 2, 0));
    if (P.flinch > 0.3) lookTarget = pelvisPos.clone().add(V3(0, 10, 0)).add(out.clone().multiplyScalar(2));
    const headPosApprox = pelvisPos.clone().add(V3(0, 0.67 * o.h, 0));
    const ld = lookTarget.sub(headPosApprox).normalize();
    // keep the gaze in the outward hemisphere, turning the torso up to ~70 degrees
    const yawWanted = Math.atan2(ld.x, ld.z) - face;
    const yw = Math.atan2(Math.sin(yawWanted), Math.cos(yawWanted));
    P.yawOffT = Math.max(-0.9, Math.min(0.9, yw * 0.55));
    P.yawOff += (P.yawOffT - P.yawOff) * Math.min(1, dt * 1.5);
    P.lookT.copy(ld);
    P.look.lerp(P.lookT, Math.min(1, dt * 2.5)).normalize();
    const lean = P.state === 'lean' ? 0.22 : P.state === 'camera' ? 0.05 : 0.12;
    P.lean += (lean - P.lean) * Math.min(1, dt * 2);
    this.pose(P, dt, t, hero, out, face);
  }

  pilot(P, dt, t, hero, st, bInv) {
    const s = P.slot, o = P.o;
    const F = hero.flight;
    const out = V3(0, 0, 1);
    // glance up at the envelope at the start of every blast, otherwise check the horizon and the ground
    let lt;
    const cyc = (t + P.phase) % 14;
    if (P.flinch > 0.2 || (hero.flameI > 0.5 && P.stateT % 5 < 2)) lt = V3(0.1, 1, 0.25);
    else if (cyc < 5) { const v = this.toLocalDir(V3(F.v.x, 0, F.v.z).normalize()); lt = v.add(V3(0, 0.05, 0)); }
    else if (cyc < 8) lt = V3(Math.sin(t * 0.2) * 0.5, -0.6, 0.8);
    else if (cyc < 10) lt = V3(0, 1, 0.35);
    else lt = V3(Math.sin(t * 0.3 + 1) * 0.9, 0.1, 0.6);
    // the pilot can turn his head but keeps facing the burner
    lt.normalize();
    if (lt.z < -0.2) lt.z = -0.2;
    P.look.lerp(lt.normalize(), Math.min(1, dt * 3)).normalize();
    P.yawOff += (Math.atan2(P.look.x, Math.max(0.2, P.look.z)) * 0.3 - P.yawOff) * Math.min(1, dt * 2);
    P.lean += (0.02 - P.lean) * dt;
    this.pose(P, dt, t, hero, out, 0, true);
  }

  pose(P, dt, t, hero, out, face, isPilot = false) {
    const o = P.o, s = P.slot;
    const h = o.h;
    const F = hero.flight;
    const M = P.mat.uniforms.uBones.value;
    // breathing and weight shift; counter-sway against the basket swing
    const breath = Math.sin(t * 1.6 + P.phase);
    P.exhale = Math.max(0, -breath);
    const shift = Math.sin(t * 0.31 + P.phase) * 0.025 - F.swing.x * 0.4;
    const yaw = face + P.yawOff;
    const qYaw = new THREE.Quaternion().setFromAxisAngle(UPY, yaw);
    const pelvis = V3(s.x + shift * Math.cos(face), 0.95 * h - 0.01 * P.flinch, s.z + shift * Math.sin(face) * 0);
    const fwd = V3(0, 0, 1).applyQuaternion(qYaw);
    const right = V3(1, 0, 0).applyQuaternion(qYaw);
    const mPelvis = new THREE.Matrix4().compose(pelvis, qYaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(0, 0, 1), shift * 2)), V3(1, h, 1));
    M[B.PELVIS].copy(mPelvis);
    // chest leans forward over the rim
    const qChest = qYaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), P.lean + breath * 0.012 - P.flinch * 0.05));
    const chestPos = pelvis.clone().add(V3(0, 0.1 * h, 0));
    const breathS = 1 + breath * 0.012;
    M[B.CHEST].compose(chestPos, qChest, V3(breathS, h, breathS));
    const chestUp = V3(0, 1, 0).applyQuaternion(qChest);
    const neckPos = chestPos.clone().addScaledVector(chestUp, 0.5 * h);
    // head looks along P.look, limited
    const lk = P.look.clone();
    const headPos = neckPos.clone().add(V3(0, 0.12, 0)).addScaledVector(fwd, 0.01);
    const hz = lk.clone(); hz.y = Math.max(-0.7, Math.min(0.85, hz.y));
    const hq = new THREE.Quaternion();
    const hm = new THREE.Matrix4().lookAt(V3(), hz.clone().negate(), UPY);
    hq.setFromRotationMatrix(hm);
    // clamp head yaw relative to chest to ~80 degrees
    const relYaw = Math.atan2(hz.x, hz.z) - yaw;
    const ry = Math.atan2(Math.sin(relYaw), Math.cos(relYaw));
    if (Math.abs(ry) > 1.4) {
      const cy = yaw + Math.sign(ry) * 1.4;
      const pitch = Math.asin(Math.max(-0.7, Math.min(0.85, hz.y)));
      hm.lookAt(V3(), V3(-Math.sin(cy) * Math.cos(pitch), -Math.sin(pitch), -Math.cos(cy) * Math.cos(pitch)), UPY);
      hq.setFromRotationMatrix(hm);
    }
    // small nod with breath, a shiver of cold now and then
    hq.multiply(new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), breath * 0.02));
    // in the first-person view we are the pilot: hide his head so the eye sits where it was
    M[B.HEAD].compose(headPos, hq, V3(1, 1, 1).multiplyScalar(isPilot && this.hideHead ? 0.0001 : 1));
    if (isPilot) { P.eyeLocal = headPos.clone().addScaledVector(fwd, 0.08).add(V3(0, 0.03, 0)); }
    P.mouth.set(0, -0.05, 0.12).applyQuaternion(hq).add(headPos);
    // shoulders
    const shL = neckPos.clone().addScaledVector(V3(1, 0, 0).applyQuaternion(qChest), -0.19).addScaledVector(chestUp, -0.06);
    const shR = neckPos.clone().addScaledVector(V3(1, 0, 0).applyQuaternion(qChest), 0.19).addScaledVector(chestUp, -0.06);
    // hand targets
    const rimY = this.rimY;
    const B2 = BASKET;
    let tL, tR, palmL = V3(0, -1, 0), palmR = V3(0, -1, 0);
    let camPose = null;
    const rimPoint = (side) => {
      // point on the rim top in front of the shoulder, offset sideways
      const base = V3(s.x, 0, s.z).addScaledVector(right, side * 0.17);
      // project to the nearest rim edge along the outward direction
      const halfL = B2.L / 2 - B2.wall / 2, halfW = B2.W / 2 - B2.wall / 2;
      const p = base.clone();
      if (Math.abs(out.z) > Math.abs(out.x)) p.z = Math.sign(out.z) * halfW; else p.x = Math.sign(out.x) * halfL;
      p.y = rimY + 0.06;
      return p;
    };
    if (isPilot) {
      const valves = this.hero.rig.valves;
      const burning = this.hero.flameI > 0.3 || this.hero.flight.burn;
      // idle hands rest on the partition tops; the right hand works the blast valve
      tR = burning ? valves[1].clone().add(V3(0, -0.02, -0.02)) : V3(0.43, BASKET.H - 0.06, 0.24 + Math.sin(t * 0.3) * 0.03);
      tL = V3(-0.43, BASKET.H - 0.06, 0.22 + Math.sin(t * 0.4 + 1) * 0.03);
      // venting: the left hand hauls on the red line
      if (this.hero.flight.vent) tL = V3(0.28, 1.68 - 0.12 * Math.sin(t * 2.5) ** 2, 0.34);
      palmR = burning ? V3(0, 0, 1) : V3(0, -1, 0);
    } else {
      tL = rimPoint(-1); tR = rimPoint(1);
      if (P.state === 'point' && P.target) {
        const dir = P.target.clone().sub(shR).normalize();
        // keep the pointing arm outward and above the rim
        if (dir.dot(out) < 0.35) dir.addScaledVector(out, 0.35 - dir.dot(out)).normalize();
        dir.y = Math.max(dir.y, 0.05);
        dir.normalize();
        const ext = Math.min(1, P.stateT * 2) * (1 - Math.max(0, P.stateT - P.dur + 0.6) / 0.6);
        const pointAt = shR.clone().addScaledVector(dir, 0.55);
        pointAt.y = Math.max(pointAt.y, rimY + 0.2);
        tR = tR.clone().lerp(pointAt, Math.max(0, ext));
        palmR = dir.clone();
      } else if (P.state === 'camera') {
        const k = Math.min(1, P.stateT * 1.5) * (1 - Math.max(0, P.stateT - P.dur + 0.6) / 0.6);
        const hf = V3(0, 0, 1).applyQuaternion(hq);
        const camP = headPos.clone().addScaledVector(hf, 0.2).add(V3(0, -0.02, 0));
        const sideV = V3(1, 0, 0).applyQuaternion(hq);
        tL = tL.clone().lerp(camP.clone().addScaledVector(sideV, -0.075), k);
        tR = tR.clone().lerp(camP.clone().addScaledVector(sideV, 0.075), k);
        camPose = { p: camP, q: hq.clone(), k };
        palmL = sideV.clone(); palmR = sideV.clone().negate();
      }
      if (P.flinch > 0.6) { tL.y += 0.0; }
    }
    // smooth hand motion
    if (!P.handL) { P.handL = tL.clone(); P.handR = tR.clone(); }
    P.handL.lerp(tL, Math.min(1, dt * 5)); P.handR.lerp(tR, Math.min(1, dt * 5));
    // never let a hand sink into the rim: if it is over the rim footprint, keep it on top
    for (const hnd of [P.handL, P.handR]) {
      const halfL = B2.L / 2, halfW = B2.W / 2;
      const nearRim = Math.abs(Math.abs(hnd.x) - (halfL - 0.035)) < 0.12 || Math.abs(Math.abs(hnd.z) - (halfW - 0.035)) < 0.12;
      if (nearRim && hnd.y < rimY + 0.05) hnd.y = rimY + 0.05;
      // stay inside the basket footprint unless above the rim
      if (hnd.y < rimY + 0.05) { hnd.x = Math.max(-halfL + 0.12, Math.min(halfL - 0.12, hnd.x)); hnd.z = Math.max(-halfW + 0.12, Math.min(halfW - 0.12, hnd.z)); }
    }
    const la = o.ua * h, lb = o.fa * h;
    const arm = (sh, hand, uaB, faB, hB, side, palm) => {
      const pole = V3(side * 0.6, -1, -0.35).applyQuaternion(qYaw).normalize();
      const { elbow, wrist } = solveArm(sh, hand.clone().add(V3(0, 0.07, 0)), la, lb, pole);
      M[uaB].copy(boneFrom(sh, elbow.clone().sub(sh).normalize(), fwd));
      M[faB].copy(boneFrom(elbow, wrist.clone().sub(elbow).normalize(), fwd));
      // the hand continues the forearm, palm turned toward its target surface
      const hd = isPilot && palm.z > 0.5 ? V3(0, 1, 0.2).normalize().negate() : wrist.clone().sub(elbow).normalize().lerp(palm, 0.5).normalize();
      M[hB].copy(boneFrom(wrist, hd, palm.clone().cross(UPY).lengthSq() > 0.01 ? fwd : fwd));
    };
    arm(shL, P.handL, B.LUA, B.LFA, B.LH, -1, palmL);
    arm(shR, P.handR, B.RUA, B.RFA, B.RH, 1, palmR);
    // legs: straight, slight knee bend with the weight shift
    const hipL = pelvis.clone().addScaledVector(right, -0.09).add(V3(0, -0.02, 0));
    const hipR = pelvis.clone().addScaledVector(right, 0.09).add(V3(0, -0.02, 0));
    for (const [hip, thB, shB, sgn] of [[hipL, B.LTH, B.LSH, -1], [hipR, B.RTH, B.RSH, 1]]) {
      const foot = V3(hip.x, 0.0, hip.z).addScaledVector(right, sgn * 0.03 - shift * 0.4);
      const { elbow: knee } = solveArm(hip, foot.add(V3(0, 0.05 * h, 0)), 0.44 * h, 0.42 * h, fwd.clone());
      M[thB].copy(boneFrom(hip, knee.clone().sub(hip).normalize(), fwd));
      M[shB].copy(boneFrom(knee, V3(0, -1, 0), fwd));
    }
    if (camPose && camPose.k > 0.05) M[B.CAM].compose(camPose.p, camPose.q, V3(1, 1, 1));
    else M[B.CAM].compose(P.handR.clone(), new THREE.Quaternion(), V3(0.001, 0.001, 0.001));
    // world mouth position for breath
    P.mouthWorld = (P.mouthWorld || V3()).copy(P.mouth).applyMatrix4(hero.basket.matrixWorld);
  }
}
