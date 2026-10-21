// Light-space cascades: basket detail around the hero, then slices of the view by distance from the
// camera (two on high, one below), and a wide one that only far balloons cast into.
import * as THREE from 'three';
import { U, G } from '../core/shared.js';
import { casters } from '../core/mat.js';

// where each view slice ends, in metres from the camera
const SLICES = { high: [250, 900], medium: [700], lite: [500] };

export class Shadows {
  constructor(renderer, tier = 'high') {
    this.renderer = renderer;
    this.slices = SLICES[tier] || SLICES.high;
    this.high = tier === 'high';
    U.uShadowHQ.value = this.high ? 1 : 0;
    const lite = tier === 'lite';
    // basket, slices, far balloons. The last slice carries the ground and cliffs out to the haze, so it
    // gets the most texels.
    const defs = [{ res: lite ? 1024 : 2048, layer: 1, back: 400 }];
    this.slices.forEach((f, i) => defs.push({ res: lite ? 1024 : i === this.slices.length - 1 ? 4096 : 2048, layer: 1, back: 3000, slice: i }));
    defs.push({ res: lite ? 1024 : 2048, layer: 3, back: 9000, half: 6000 });
    const mkRT = (w, h) => {
      const rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
      rt.depthTexture = new THREE.DepthTexture(w, h);
      rt.depthTexture.type = THREE.FloatType;
      rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
      return rt;
    };
    // the basket and balloon cascades share one map side by side: every terrain texture unit is
    // spoken for, and this frees one
    const R = defs[0].res, atlas = mkRT(R * 2, R);
    defs[0].vp = new THREE.Vector4(0, 0, R, R);
    defs[defs.length - 1].vp = new THREE.Vector4(R, 0, R, R);
    this.cascades = defs.map(d => {
      const rt = d.vp ? atlas : mkRT(d.res, d.res);
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 10);
      cam.layers.set(d.layer);
      // the shadow-only ground grid casts into the nearest slice only
      if (d.slice === 0) cam.layers.enable(5);
      return Object.assign(d, { rt, cam, half: d.half || 55, center: new THREE.Vector3() });
    });
    // four slots in the shaders: basket, near slice, far slice, balloons (the last in the atlas with the
    // first). With one slice, the far slice slot points at the same map and its split is 0, so it's
    // never picked.
    const c = this.cascades, n = c.length;
    U.uShadow0.value = atlas.depthTexture;
    U.uShadow1.value = c[1].rt.depthTexture;
    U.uShadow2.value = c[n === 4 ? 2 : 1].rt.depthTexture;
    this.slot = n === 4 ? [0, 1, 2, 3] : [0, 1, 3];
    U.uShadowSplit.value.set(this.slices[0], this.slices[1] || 0);
    this._v = new THREE.Vector3();
    this._d = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this.frame = 0;
  }

  // Each view slice is covered by the bounding sphere of that slice of the camera frustum. Its radius
  // doesn't change as the camera turns, so turning only moves the centre, and the texel snap below
  // keeps the grid still under it. (The main cascade used to sit on a point 500 m ahead, so turning
  // swung it across the mountains.) shift is a test hook that slides every centre.
  fit(camera, focus, farCenter, shift) {
    const c = this.cascades, last = c.length - 1;
    c[0].center.copy(focus);
    c[last].center.copy(farCenter);
    const tv = Math.tan(THREE.MathUtils.degToRad(Math.max(camera.fov, 50)) / 2), th = tv * Math.max(camera.aspect, 1.6);
    const k2 = tv * tv + th * th;
    camera.getWorldDirection(this._d);
    let n = camera.near;
    for (let i = 0; i < this.slices.length; i++) {
      const f = this.slices[i], cc = c[i + 1];
      let ctr = (f + n) * (1 + k2) / 2, rad;
      if (ctr > f) { ctr = f; rad = f * Math.sqrt(k2); } else rad = Math.sqrt((f - ctr) * (f - ctr) + f * f * k2);
      // radius in whole 16 m steps, so a zoom doesn't change the texel size every frame
      cc.half = Math.ceil(rad / 16) * 16;
      cc.center.copy(camera.position).addScaledVector(this._d, ctr);
      // the next slice starts inside this one, so they can blend over the overlap
      n = f * 0.85;
    }
    if (shift) for (const cc of c) cc.center.add(shift);
    U.uShadowEye.value.copy(camera.position);
  }

  render(scene) {
    const L = U.uKeyDir.value;
    const r = this.renderer;
    const mats = [U.uShadowM0.value, U.uShadowM1.value, U.uShadowM2.value, U.uShadowM3.value];
    const K = U.uShadowK.value, WT = U.uShadowWT.value;
    this._up.set(0, 1, 0);
    if (Math.abs(L.y) > 0.98) this._up.set(0, 0, 1);
    // swap every caster to its depth material
    for (const m of casters) { m.userData._mat = m.material; m.material = m.material.userData.depthMat; }
    const oldBg = scene.background; scene.background = null;
    this.frame++;
    const last = this.cascades.length - 1;
    for (let i = 0; i <= last; i++) {
      const c = this.cascades[i];
      // everything refreshes every frame on high: on alternate frames a moving balloon's shadow
      // stepped along at half rate, and the sun's sweep did too. Below high the far one, for distant
      // balloons only, can skip.
      if (!this.high && this.frame > 4 && i === last && (this.frame & 1)) continue;
      const cam = c.cam, half = c.half, back = c.back, center = c.center;
      // The light's view sits on a line through a fixed anchor, so its texel grid is fixed in the
      // world and only the window over it moves; the centre is snapped to whole texels in that grid.
      // (It used to look straight at the centre, which put the centre at 0,0 in its own view every
      // frame: the snap did nothing and the grid slid by sub-texel amounts, so cliff edges crawled.)
      // The anchor isn't the origin: as the sun turns, the grid swings about the anchor, and far
      // from it that swing is a slide. So it sits on the centre and only jumps to catch up once the
      // centre has wandered a quarter of the cascade away.
      const a = c.anchor || (c.anchor = center.clone());
      if (a.distanceToSquared(center) > half * half * 0.0625) a.copy(center);
      cam.up.copy(this._up);
      cam.position.copy(L).multiplyScalar(this._v.subVectors(center, a).dot(L) + back).add(a);
      this._v.copy(cam.position).sub(L);
      cam.lookAt(this._v);
      cam.updateMatrixWorld();
      const texel = (2 * half) / c.res;
      this._v.copy(center).applyMatrix4(cam.matrixWorldInverse);
      const cx = Math.round(this._v.x / texel) * texel, cy = Math.round(this._v.y / texel) * texel;
      cam.left = cx - half; cam.right = cx + half; cam.bottom = cy - half; cam.top = cy + half;
      cam.near = -this._v.z - back; cam.far = -this._v.z + half * 1.5 + 600;
      cam.updateProjectionMatrix();
      const s = this.slot[i];
      mats[s].multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      K.setComponent(s, 1 / (cam.far - cam.near));
      WT.setComponent(s, texel);
      G.prof && G.prof.begin('shadow' + i);
      if (c.vp) { c.rt.viewport.copy(c.vp); c.rt.scissor.copy(c.vp); }
      c.rt.scissorTest = !!c.vp;
      r.setRenderTarget(c.rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, false);
      r.render(scene, cam);
    }
    scene.background = oldBg;
    for (const m of casters) m.material = m.userData._mat;
  }
}
