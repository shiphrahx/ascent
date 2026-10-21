// Three light-space cascades: basket detail, the valley around the camera, and far balloons.
import * as THREE from 'three';
import { U, G } from '../core/shared.js';
import { casters } from '../core/mat.js';


export class Shadows {
  constructor(renderer, res = 2048, mainRes = res) {
    this.renderer = renderer;
    this.cascades = [];
    // the middle cascade carries the ground and cliffs around the view, so it gets the most texels
    const sizes = [55, 600, 6000];
    for (let i = 0; i < 3; i++) {
      const RES = i === 1 ? mainRes : res;
      const rt = new THREE.WebGLRenderTarget(RES, RES, { depthBuffer: true });
      rt.depthTexture = new THREE.DepthTexture(RES, RES);
      rt.depthTexture.type = THREE.FloatType;
      rt.depthTexture.minFilter = rt.depthTexture.magFilter = THREE.NearestFilter;
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 10);
      cam.layers.set(i === 2 ? 3 : 1);
      this.cascades.push({ rt, cam, size: sizes[i], range: 7000, res: RES });
    }
    U.uShadow0.value = this.cascades[0].rt.depthTexture;
    U.uShadow1.value = this.cascades[1].rt.depthTexture;
    U.uShadow2.value = this.cascades[2].rt.depthTexture;
    this._v = new THREE.Vector3();
    this._up = new THREE.Vector3();
    this._m = new THREE.Matrix4();
    this.frame = 0;
  }

  render(scene, focus, viewCenter, farCenter) {
    const L = U.uKeyDir.value;
    const r = this.renderer;
    const centers = [focus, viewCenter, farCenter];
    const mats = [U.uShadowM0.value, U.uShadowM1.value, U.uShadowM2.value];
    const K = U.uShadowK.value, WT = U.uShadowWT.value;
    this._up.set(0, 1, 0);
    if (Math.abs(L.y) > 0.98) this._up.set(0, 0, 1);
    // swap every caster to its depth material
    for (const m of casters) { m.userData._mat = m.material; m.material = m.material.userData.depthMat; }
    const oldBg = scene.background; scene.background = null;
    this.frame++;
    for (let i = 0; i < 3; i++) {
      const c = this.cascades[i];
      // the near and main cascades refresh every frame: on alternate frames a moving balloon's shadow
      // stepped along at half rate. Only the far one, for distant balloons, can skip.
      if (this.frame > 4 && i === 2 && (this.frame & 1)) continue;
      const cam = c.cam;
      const half = c.size;
      const back = i === 0 ? 400 : i === 1 ? 3000 : 9000;
      cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
      cam.near = 1; cam.far = back + half * 1.5 + 600;
      cam.updateProjectionMatrix();
      // snap the centre to whole texels in light space to stop shimmering
      cam.up.copy(this._up);
      cam.position.copy(centers[i]).addScaledVector(L, back);
      cam.lookAt(centers[i]);
      cam.updateMatrixWorld();
      const texel = (2 * half) / c.res;
      this._v.copy(centers[i]).applyMatrix4(cam.matrixWorldInverse);
      const sx = this._v.x - Math.round(this._v.x / texel) * texel;
      const sy = this._v.y - Math.round(this._v.y / texel) * texel;
      cam.left -= sx; cam.right -= sx; cam.top -= sy; cam.bottom -= sy;
      cam.updateProjectionMatrix();
      mats[i].multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      K.setComponent(i, 1 / (cam.far - cam.near));
      WT.setComponent(i, texel);
      G.prof && G.prof.begin('shadow' + i);
      r.setRenderTarget(c.rt);
      r.setClearColor(0x000000, 0);
      r.clear(true, true, false);
      r.render(scene, cam);
    }
    scene.background = oldBg;
    for (const m of casters) m.material = m.userData._mat;
  }
}
