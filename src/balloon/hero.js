// The hero balloon: envelope + skirt + crown, basket rig, flying wires, flames, crew.
import * as THREE from 'three';
import { U, G } from '../core/shared.js';
import { addCaster } from '../core/mat.js';
import { buildEnvelope, buildSkirt, buildCrown, envelopeMaterial, ENV } from './envelope.js';
import { buildRig, BASKET, segment } from './rig.js';
import { propMaterial, tag } from './props.js';
import { makeFlame } from '../fx/flame.js';
import { Flight, HANG } from './flight.js';

export class Hero {
  constructor(scene, data, rocks, wind) {
    this.flight = new Flight(data, rocks, wind);
    this.root = new THREE.Group();
    scene.add(this.root);
    // envelope frame pivots at the mouth
    this.env = new THREE.Group();
    this.root.add(this.env);
    this.envMat = envelopeMaterial(false);
    this.envMesh = new THREE.Mesh(buildEnvelope(G.tier === 'lite' ? 1 : 0), this.envMat);
    this.skirt = new THREE.Mesh(buildSkirt(0), this.envMat);
    this.propMat = propMaterial(false);
    this.crown = new THREE.Mesh(tag(buildCrown(), 2), this.propMat);
    for (const m of [this.envMesh, this.skirt, this.crown]) { m.frustumCulled = false; m.layers.enable(2); m.layers.enable(3); addCaster(m); this.env.add(m); }
    // basket frame hangs from the mouth
    this.basket = new THREE.Group();
    this.root.add(this.basket);
    const rig = buildRig();
    this.rig = rig;
    this.rigMesh = new THREE.Mesh(rig.geo, this.propMat);
    this.rigMesh.frustumCulled = false; this.rigMesh.layers.enable(2); this.rigMesh.layers.enable(3);
    addCaster(this.rigMesh);
    this.basket.add(this.rigMesh);
    // flames on each burner, pilot lights always on
    this.flames = rig.burners.map(b => { const f = makeFlame(3.3, 0.3, 1); f.position.copy(b); this.basket.add(f); return f; });
    this.pilots = rig.burners.map(b => { const f = makeFlame(0.22, 0.05, 0.6); f.position.copy(b).add(new THREE.Vector3(0.09, -0.12, 0.04)); f.material.uniforms.uI.value = 1; this.basket.add(f); return f; });
    // flying wires: 20 load tapes down to the four frame corners, plus the red vent line
    const cg = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true); cg.translate(0, 0.5, 0);
    const cgeo = tag(cg, 2);
    this.cables = new THREE.InstancedMesh(cgeo, this.propMat, ENV.NG + 3);
    this.cables.frustumCulled = false; this.cables.layers.enable(2);
    addCaster(this.cables);
    scene.add(this.cables);
    this.burnSmooth = 0;
    this.flameI = 0;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._a = new THREE.Vector3(); this._b = new THREE.Vector3();
    this._e = new THREE.Euler();
    this.burnerWorld = new THREE.Vector3();
    this.crew = null;
    this.deflate = 0;
  }

  update(dt, t, input, st) {
    const F = this.flight;
    // dawn: stay low among the chimneys until the sun is up, then climb
    F.dawnHold = (st.hour < 12 && st.sunElev < 1.2 * Math.PI / 180 && st.sunElev > -12 * Math.PI / 180) ? 52 : null;
    F.step(dt, t, input);
    const p = F.p;
    // after touchdown the crown line pulls the envelope over downwind and it settles on the field
    if (F.mode === 'landed') this.deflate = Math.min(1, this.deflate + dt / 20);
    else this.deflate = 0;
    const tip = Math.min(1, this.deflate / 0.5);
    const tipA = (tip * tip * (3 - 2 * tip)) * (Math.PI / 2 - 0.12);
    if (F.mode === 'landed' && !this.tipAxis) {
      const w = F.wind.at(p.x, p.y, p.z);
      this.tipAxis = new THREE.Vector3(w.z, 0, -w.x).normalize();
      if (this.tipAxis.lengthSq() < 0.5) this.tipAxis.set(0, 0, 1);
    }
    if (F.mode !== 'landed') this.tipAxis = null;
    this.root.position.set(0, 0, 0);
    // envelope: yaw + lean around the mouth
    this.env.position.copy(p);
    this._e.set(F.lean.y * 0.6, F.yaw, -F.lean.x * 0.6, 'YXZ');
    this.env.quaternion.setFromEuler(this._e);
    if (this.tipAxis) this.env.quaternion.premultiply(this._q.setFromAxisAngle(this.tipAxis, tipA));
    // basket: yaw + pendulum swing, hanging HANG below
    this._e.set(F.swing.y, F.yaw, -F.swing.x, 'YXZ');
    this.basket.quaternion.setFromEuler(this._e);
    this._v.set(0, -HANG, 0).applyQuaternion(this.basket.quaternion);
    this.basket.position.copy(p).add(this._v);
    this.env.updateMatrixWorld(true); this.basket.updateMatrixWorld(true);

    // burner response: valve opens fast, flame builds over ~0.15 s, collapses fast
    this.flameI += ((F.burn ? 1 : 0) - this.flameI) * Math.min(1, dt * (F.burn ? 9 : 14));
    this.burnSmooth += (this.flameI - this.burnSmooth) * Math.min(1, dt * 1.2);
    for (const f of this.flames) {
      f.material.uniforms.uI.value = this.flameI;
      // flame leans with the airflow relative to the basket
      f.material.uniforms.uBend.value.set(-F.relWind.x * 0.02, 0, -F.relWind.z * 0.02);
    }
    // envelope uniforms
    const eu = this.envMat.uniforms;
    eu.uBurn.value = this.flameI;
    eu.uBreath.value = 0.004 * Math.sin(t * 0.8) + 0.012 * this.burnSmooth;
    eu.uDent.value = F.dent;
    eu.uRipple.value = 0.03 + 0.05 * F.gust + Math.min(0.08, F.relWind.length() * 0.012);
    this._v.copy(F.dentDir).applyQuaternion(this._q.copy(this.env.quaternion).invert());
    eu.uDentDir.value.copy(this._v).setY(0).normalize();
    eu.uLying.value = this.deflate > 0 ? 1 : 0; eu.uInflate.value = 1 - Math.max(0, this.deflate - 0.25) * 0.85;
    eu.uGroundY.value = this.flight.groundAt(F.p.x, F.p.z);
    this.burnerWorld.copy(this.rig.burners[0]).lerp(this.rig.burners[1], 0.5).applyMatrix4(this.basket.matrixWorld);
    this.burnerWorld.y += 1.2;
    eu.uBurnerPos.value.copy(this.burnerWorld);
    eu.uFlameI.value = 1.1;
    // local light for basket and crew: flame plus pilot lights
    const pu = this.propMat.uniforms;
    pu.uLocalLightPos.value.copy(this.burnerWorld);
    pu.uLocalLightCol.value.setRGB(1.0, 0.55, 0.22).multiplyScalar((this.flameI * 1.6 + 0.06) * U.uGlowComp.value);

    // flying wires
    const mouthR = ENV.mouthR;
    const corners = this.rig.frameCorners;
    let k = 0;
    for (let i = 0; i < ENV.NG; i++) {
      const th = i / ENV.NG * Math.PI * 2;
      this._a.set(Math.cos(th) * mouthR, 0.02, Math.sin(th) * mouthR).applyMatrix4(this.env.matrixWorld);
      // each tape goes to the nearest frame corner
      const cx = Math.cos(th) > 0 ? 1 : -1, cz = Math.sin(th) > 0 ? 1 : -1;
      const c = corners.find(v => Math.sign(v.x) === cx && Math.sign(v.z) === cz);
      this._b.copy(c).applyMatrix4(this.basket.matrixWorld);
      this.setCable(k++, this._b, this._a, 0.007);
    }
    // vent line: crown down through the mouth to the frame
    this._a.set(0, ENV.height - 0.4, 0).applyMatrix4(this.env.matrixWorld);
    this._b.set(0.05, 0.3, 0.05).applyMatrix4(this.env.matrixWorld);
    this.setCable(k++, this._b, this._a, 0.009);
    this._a.copy(this._b);
    this._b.set(0.28, 1.72, 0.34).applyMatrix4(this.basket.matrixWorld);
    this.setCable(k++, this._b, this._a, 0.009);
    this.cables.count = k;
    this.cables.instanceMatrix.needsUpdate = true;

    if (this.crew) this.crew.update(dt, t, this, st);
  }
  setCable(i, a, b, r) {
    const d = this._v.subVectors(b, a);
    const len = d.length();
    this._q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.divideScalar(len));
    this._m.compose(a, this._q, new THREE.Vector3(r, len, r));
    this.cables.setMatrixAt(i, this._m);
  }
  get position() { return this.flight.p; }
}
